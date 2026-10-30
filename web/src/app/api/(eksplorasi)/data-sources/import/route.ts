import { route } from "@/core/lib/http/api-route";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { readUpload } from "@/core/lib/http/upload";
import { ndjsonResponse } from "@/core/lib/http/ndjson";
import { dataSourceImportGate } from "@/modules/eksplorasi/lib/gates";
import { fileKindOf, readUploadedSheet } from "@/modules/eksplorasi/lib/data-source-file";
import { MAX_IMPORT_ROWS, readDataSourceSheet } from "@/modules/eksplorasi/lib/data-source-import";
import { findExistingSamples, planImport, writeImport } from "@/modules/eksplorasi/lib/data-source-upsert";
import { unknownOriginals } from "@/modules/eksplorasi/lib/duplicate-originals";
import { viewOf, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";

/**
 * Importing a sheet (.xlsx or .csv) into one list, in two calls with the same
 * file.
 *
 *   apply=0  reads and checks every row and says what would happen: how many
 *            samples are new, how many exist already, and every row that is
 *            wrong and why. Nothing is written.
 *   apply=1  does it. The answer is a stream of NDJSON lines -- progress as
 *            each chunk is written, then the totals -- so a 34,000-row sheet
 *            shows a moving bar rather than a spinner for half a minute.
 *
 * `view` is the list the file is imported from. A QC list's file may leave the
 * sample type out -- every row is that list's type -- and a row of another
 * type is refused; the data source's file names each row's type.
 *
 * The file is sent twice rather than kept between the calls: nothing has to
 * be stored, expired or cleaned up, and reading it again costs a few seconds.
 * Rows that are wrong are left out and the rest go in.
 */

/** About 34,000 rows is 3-5 MB as CSV and less as .xlsx; this leaves room. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Errors sent back at most; a sheet that bad wants fixing at its source first. */
const MAX_REPORTED_ERRORS = 10_000;

const READ_ERRORS = {
  unreadable: ["That file could not be read. Save it as .xlsx or .csv and try again.", 422],
  empty: ["That file has no rows.", 422],
  noSampleId: ['No "Sample ID" column was found on the first row. Use the template\'s headers.', 422],
  noSampleType: ['No "Sample Type" column was found on the first row: the data source needs each row\'s type.', 422],
  tooMany: [`That file has more than ${MAX_IMPORT_ROWS.toLocaleString("en")} rows. Split it and import each part.`, 413],
} as const;

export const POST = route({ capability: "manageExplorationData" }, async ({ request, session }) => {
  const { file, form } = await readUpload(request, MAX_UPLOAD_BYTES);
  const kind = fileKindOf(file);
  if (!kind) throw new ApiError("Only .xlsx and .csv files can be imported.", 415, "file-type");
  const apply = form.get("apply") === "1";
  const view = viewOf(form.get("view")?.toString());

  // Reading 34,000 rows is work worth queueing for, the preview included.
  const release = dataSourceImportGate.acquire();
  let streaming = false;
  try {
    const upload = await readUploadedSheet(file, kind);
    const sheet = upload.ok ? readDataSourceSheet(upload.lines, VIEWS[view].sampleType) : null;
    if (!upload.ok || !sheet?.ok) {
      const code = !upload.ok ? upload.error : sheet && !sheet.ok ? sheet.error : "unreadable";
      const [message, status] = READ_ERRORS[code];
      throw new ApiError(message, status, `file-${code}`);
    }

    // A duplicate's Remarks must name a FIELD sample; a row that does not is left out with the others.
    const unknown = await unknownOriginals(sheet.rows);
    const refused = new Set(unknown.map((error) => error.line));
    const rows = sheet.rows.filter((row) => !refused.has(row.line));
    const errors = [...sheet.errors, ...unknown].sort((a, b) => a.line - b.line);
    const invalid = sheet.invalid + refused.size;

    const existing = await findExistingSamples(rows.map((row) => row.data.sampleId));
    const plan = planImport(rows, existing, form.get("updateExisting") === "1");

    if (!apply) {
      return jsonSuccess({
        total: sheet.total,
        valid: rows.length,
        create: plan.creates.length,
        existing: plan.updates.length + plan.skips.length,
        invalid,
        errors: errors.slice(0, MAX_REPORTED_ERRORS),
        errorsTotal: errors.length,
        ignoredHeaders: sheet.ignoredHeaders,
      });
    }

    // From here the gate is the stream's to release, however it ends.
    streaming = true;
    return ndjsonResponse(
      async (send) => {
        send({ phase: "write", done: 0, total: plan.creates.length + plan.updates.length });
        const result = await writeImport(plan, session.userId, (done, total) => send({ phase: "write", done, total }));
        send({
          phase: "done",
          created: result.created,
          updated: result.updated,
          // Samples added by somebody else between the preview and this write.
          skipped: plan.skips.length + (plan.creates.length - result.created),
          invalid,
        });
      },
      {
        errorMessage:
          "The import stopped partway. Rows written so far are kept; importing the same file again finishes it.",
        onFinally: release,
        logLabel: "data source import",
      }
    );
  } finally {
    if (!streaming) release();
  }
});
