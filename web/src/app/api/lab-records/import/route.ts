import { NextRequest } from "next/server";
import { invalidateAnalytics } from "@/lib/analytics-cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { importLabRecordsSchema, updateLabRecordSchema } from "@/lib/validation";
import { diffLabRecord, labRecordValueSelect, type LabRecordChange } from "@/lib/lab-record";
import { MAX_IMPORT_ROWS, readImportCell, readImportSheet } from "@/lib/lab-record-import";
import type { ImportPreviewRow } from "@/types";
import { readJsonBody } from "@/lib/api-request";
import { ensureSub, resolvePastedKeys } from "@/lib/sub-records";
import { findOverwrites } from "@/lib/overwrite";
import { lockLabRecords } from "@/lib/record-lock";

type Values = Record<string, number | string | Date | null>;
type DiffInput = Parameters<typeof diffLabRecord>[0];

const freshSelect = { ...labRecordValueSelect, id: true, labCode: true } satisfies Prisma.LabRecordSelect;

export async function POST(request: NextRequest) {
  try {
    const session = await requireCapability(request, "enterResults");
    const body = importLabRecordsSchema.parse(await readJsonBody(request));

    const read = readImportSheet(body.csv);
    if (!read.ok) {
      // Coded, so the paste screen can explain each in the reader's language.
      const messages: Record<typeof read.error, string> = {
        empty: "Paste or choose a sheet with a header row and at least one row of results.",
        noKey: 'The sheet needs a "Sample ID" column so each row can be matched to a sample.',
        noFields: "None of the columns are results this app stores (Ni, Fe, Co, SiO2, MgO, ...).",
        tooMany: `This sheet has ${read.count} rows. Split it into parts of at most ${MAX_IMPORT_ROWS}.`,
      };
      throw new ApiError(messages[read.error], 422, `import-${read.error}`);
    }
    const { keyIndex, fields, rows: dataRows } = read.sheet;

    // Every Sample ID looked up the way the paste screen reads it: spaces and
    // slashes alike, the sack count optional, and a bracketed code after a
    // matched sample naming a sub-sample of it -- new if it is not there yet.
    // A deleted sample matches nothing, so its row is reported as unknown
    // rather than quietly written to.
    const keys = [...new Set(dataRows.map((row) => (row.cells[keyIndex] ?? "").trim()).filter(Boolean))];
    const resolved = new Map((keys.length ? await resolvePastedKeys(keys) : []).map((entry) => [entry.key, entry]));

    const preview: ImportPreviewRow[] = [];
    const toApply: {
      recordId: string | null;
      sub: { parentId: string; code: string } | null;
      values: Values;
      changes: Record<string, LabRecordChange>;
      overwrites: boolean;
    }[] = [];

    dataRows.forEach(({ line, cells: row }) => {
      const key = (row[keyIndex] ?? "").trim();
      const noun = "Sample ID";

      if (!key) {
        preview.push({ line, labCode: "", status: "invalid", changes: {}, message: `Missing ${noun}.` });
        return;
      }

      const match = resolved.get(key);
      if (match?.status === "ambiguous") {
        preview.push({
          line,
          labCode: key,
          status: "invalid",
          changes: {},
          message: "This Sample ID fits more than one sample once the sack count is left out. Add the sack count.",
        });
        return;
      }
      if (!match || match.status === "unknown") {
        preview.push({
          line,
          labCode: key,
          status: "unknown",
          changes: {},
          message: `No sample with this ${noun}.`,
        });
        return;
      }
      const target = match.status === "found" ? match.record : match.parent;
      const sampleCode = target.sample.sampleCode;

      const raw: Record<string, string | number | null> = {};
      let badCell: string | null = null;

      for (const field of fields) {
        const cell = readImportCell(field.key, (row[field.index] ?? "").trim());
        if ("error" in cell) {
          badCell ??= cell.error;
          continue;
        }
        raw[field.key] = cell.value;
      }

      if (badCell) {
        preview.push({ line, labCode: key, sampleCode, status: "invalid", changes: {}, message: badCell });
        return;
      }

      const parsed = updateLabRecordSchema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        preview.push({
          line,
          labCode: key,
          sampleCode,
          status: "invalid",
          changes: {},
          message: `${issue.path.join(".") || "value"}: ${issue.message}`,
        });
        return;
      }
      const values = parsed.data as Values;

      if (match.status === "newSub") {
        // Nothing is there yet, so everything filled in is a change.
        const changes = Object.fromEntries(
          Object.entries(diffLabRecord({} as DiffInput, values)).filter(([, change]) => change.to !== null)
        );
        preview.push({ line, labCode: key, sampleCode, status: "create", subCode: match.code, changes });
        toApply.push({
          recordId: null,
          sub: { parentId: match.parent.id, code: match.code },
          values,
          changes,
          overwrites: false,
        });
        return;
      }

      const record = match.record as unknown as DiffInput & Record<string, unknown>;
      const changes = diffLabRecord(record, values);
      if (Object.keys(changes).length === 0) {
        preview.push({ line, labCode: key, sampleCode, status: "unchanged", changes: {} });
        return;
      }

      const overwrites = findOverwrites(record, values);
      preview.push({
        line,
        labCode: key,
        sampleCode,
        status: "update",
        changes,
        ...(overwrites.length ? { overwrites } : {}),
      });
      // The diff is kept rather than recomputed below: it is the audit payload.
      toApply.push({ recordId: match.record.id, sub: null, values, changes, overwrites: overwrites.length > 0 });
    });

    const summary = {
      total: preview.length,
      update: preview.filter((row) => row.status === "update").length,
      create: preview.filter((row) => row.status === "create").length,
      unchanged: preview.filter((row) => row.status === "unchanged").length,
      unknown: preview.filter((row) => row.status === "unknown").length,
      invalid: preview.filter((row) => row.status === "invalid").length,
      overwrite: preview.filter((row) => (row.overwrites?.length ?? 0) > 0).length,
    };

    // Nothing is written until the user has seen the preview and confirmed it.
    if (!body.apply) {
      return jsonSuccess({ rows: preview, summary, applied: false });
    }

    if (summary.invalid > 0) {
      throw new ApiError("Fix the invalid rows before applying this import.", 422);
    }
    // Replacing results already there is a decision the request has to state.
    if (summary.overwrite > 0 && !body.overwrite) {
      throw new ApiError(
        `${summary.overwrite} row(s) would replace results that are already there.`,
        409,
        "overwrite",
        {
          overwrites: preview
            .filter((row) => row.overwrites?.length)
            .map((row) => ({ labCode: row.labCode, sampleCode: row.sampleCode, fields: row.overwrites })),
        }
      );
    }

    if (toApply.length > 0) {
      await prisma.$transaction(
        async (tx) => {
          // The preview was read before this transaction; another save may
          // have filled some of these rows since. Read them again under a lock
          // and hold the overwrite rule against what is there now.
          const fresh = await lockLabRecords(
            tx,
            toApply.flatMap((entry) => (entry.recordId ? [entry.recordId] : [])),
            freshSelect
          );
          const raced: string[] = [];
          const audits: Prisma.LabRecordAuditCreateManyInput[] = [];
          for (const entry of toApply) {
            const id = entry.sub
              ? (await ensureSub(tx, entry.sub.parentId, entry.sub.code, session.userId)).id
              : entry.recordId!;
            const now = entry.sub ? (await lockLabRecords(tx, [id], freshSelect)).get(id) : fresh.get(id);
            let { changes, overwrites } = entry;
            if (now) {
              const record = now as unknown as DiffInput & Record<string, unknown>;
              overwrites = findOverwrites(record, entry.values).length > 0;
              if (overwrites && !body.overwrite) {
                raced.push(now.labCode);
                continue;
              }
              changes = diffLabRecord(record, entry.values);
              if (Object.keys(changes).length === 0) continue;
            }
            await tx.labRecord.update({ where: { id }, data: { ...entry.values, updatedById: session.userId } });
            audits.push({
              labRecordId: id,
              changedById: session.userId,
              changes: changes as unknown as Prisma.InputJsonObject,
              reason: body.reason ?? (overwrites ? "CSV import, overwrote earlier results" : "CSV import"),
            });
          }
          if (raced.length > 0) {
            throw new ApiError(
              `${raced.length} row(s) were given results by someone else while this import was open. Preview it again.`,
              409,
              "overwrite",
              { overwrites: raced.map((labCode) => ({ labCode })) }
            );
          }
          await tx.labRecordAudit.createMany({ data: audits });
        },
        { timeout: 30_000 }
      );
    }

    // The author of this change is about to look for it on the dashboard.
    invalidateAnalytics();
    return jsonSuccess({ rows: preview, summary, applied: true });
  } catch (error) {
    return handleApiError(error);
  }
}
