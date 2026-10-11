import { NextRequest } from "next/server";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { drillHoleImportGate } from "@/lib/heavy-gate";
import { fileKindOf, readUploadedSheet } from "@/lib/drill-hole-file";
import { MAX_IMPORT_ROWS, readDrillHoleSheet, type ImportError } from "@/lib/drill-hole-import";
import { findExistingHoles, planImport, writeImport } from "@/lib/drill-hole-upsert";

/**
 * Importing a drilling sheet (.xlsx or .csv), in two calls with the same file.
 *
 *   apply=0  reads and checks every row and says what would happen: how many
 *            holes are new, how many exist already, and every row that is
 *            wrong and why. Nothing is written.
 *   apply=1  does it. The answer is a stream of NDJSON lines -- progress as
 *            each chunk is written, then the totals -- so a 34,000-row sheet
 *            shows a moving bar rather than a spinner for half a minute.
 *
 * The file is sent twice rather than kept between the calls: nothing has to
 * be stored, expired or cleaned up, and reading it again costs a few seconds.
 *
 * Rows that are wrong are left out and the rest go in. The preview lists them
 * all, and the dialog hands them back as a CSV to fix and import again.
 */

/** About 34,000 rows is 3-5 MB as CSV and less as .xlsx; this leaves room. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Errors sent back at most; a sheet that bad wants fixing at its source first. */
const MAX_REPORTED_ERRORS = 10_000;

const READ_ERRORS = {
  unreadable: ["That file could not be read. Save it as .xlsx or .csv and try again.", 422],
  empty: ["That file has no rows.", 422],
  noHoleId: ['No "Hole ID" column was found on the first row. Use the template\'s headers.', 422],
  tooMany: [`That file has more than ${MAX_IMPORT_ROWS.toLocaleString("en")} rows. Split it and import each part.`, 413],
} as const;

export async function POST(request: NextRequest) {
  let release: (() => void) | null = null;
  try {
    const session = await requireCapability(request, "manageDrilling");

    // Refused by the header before anything is buffered: formData() reads the
    // whole upload into memory.
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw new ApiError(`That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`, 413, "file-too-large");
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ApiError("Choose a file to import.", 400, "file-missing");
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(`That file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`, 413, "file-too-large");
    }
    const kind = fileKindOf(file);
    if (!kind) throw new ApiError("Only .xlsx and .csv files can be imported.", 415, "file-type");

    const apply = form?.get("apply") === "1";
    const updateExisting = form?.get("updateExisting") === "1";

    // Reading 34,000 rows is work worth queueing for, the preview included.
    release = drillHoleImportGate.acquire();

    const upload = await readUploadedSheet(file, kind);
    const sheet = upload.ok ? readDrillHoleSheet(upload.lines) : null;
    if (!upload.ok || !sheet?.ok) {
      const code = !upload.ok ? upload.error : sheet && !sheet.ok ? sheet.error : "unreadable";
      const [message, status] = READ_ERRORS[code];
      throw new ApiError(message, status, `file-${code}`);
    }

    const existing = await findExistingHoles(sheet.rows.map((row) => row.data.holeId));
    const plan = planImport(sheet.rows, existing, updateExisting);

    if (!apply) {
      const errors: ImportError[] = sheet.errors.slice(0, MAX_REPORTED_ERRORS);
      return jsonSuccess({
        total: sheet.total,
        valid: sheet.rows.length,
        create: plan.creates.length,
        existing: plan.updates.length + plan.skips.length,
        invalid: sheet.invalid,
        errors,
        errorsTotal: sheet.errors.length,
        ignoredHeaders: sheet.ignoredHeaders,
      });
    }

    // From here the gate is the stream's to release, however it ends.
    const releaseGate = release;
    release = null;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (line: object) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        try {
          send({ phase: "write", done: 0, total: plan.creates.length + plan.updates.length });
          const result = await writeImport(plan, session.userId, (done, total) =>
            send({ phase: "write", done, total })
          );
          send({
            phase: "done",
            created: result.created,
            updated: result.updated,
            // Holes added by somebody else between the preview and this write.
            skipped: plan.skips.length + (plan.creates.length - result.created),
            invalid: sheet.invalid,
          });
        } catch (error) {
          console.error("[drill-hole import]", error);
          send({
            phase: "error",
            message: "The import stopped partway. Rows written so far are kept; importing the same file again finishes it.",
          });
        } finally {
          releaseGate();
          controller.close();
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  } finally {
    release?.();
  }
}
