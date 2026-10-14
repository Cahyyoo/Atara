import { invalidateAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { importLabRecordsSchema, updateLabRecordSchema } from "@/modules/lab/validation/records";
import { diffLabRecord, labRecordValueSelect, type LabRecordChange } from "@/modules/lab/lib/records/lab-record";
import { MAX_IMPORT_ROWS, readImportCell, readImportSheet } from "@/modules/lab/lib/records/lab-record-import";
import type { ImportPreviewRow } from "@/modules/lab/types";
import { readJsonBody } from "@/core/lib/http/api-request";
import { ensureSub, resolvePastedKeys } from "@/modules/lab/lib/records/sub-records";
import { findOverwrites } from "@/modules/lab/lib/records/overwrite";
import { lockLabRecords } from "@/modules/lab/lib/records/record-lock";
import { ASSAY_KEYS, assayKey, assayWhere, groupDuplicates } from "@/modules/lab/lib/records/assay-duplicates";
import { ACTIVE_LAB_RECORD } from "@/modules/lab/lib/samples/soft-delete";

type Values = Record<string, number | string | Date | null>;
type DiffInput = Parameters<typeof diffLabRecord>[0];

const freshSelect = { ...labRecordValueSelect, id: true, labCode: true } satisfies Prisma.LabRecordSelect;

/** Stored samples named per duplicate row: enough to find them, not a list to read. */
const DUPLICATES_NAMED = 3;
/** Rows asked about in one query for stored look-alikes. */
const DUPLICATE_BATCH = 200;

/**
 * Marks the rows about to be written whose results read exactly like another
 * row's in this import, or another sample's already stored. A warning, not a
 * refusal: the summary counts them, and applying asks for `duplicates`.
 */
async function markDuplicates(
  preview: ImportPreviewRow[],
  writes: { row: ImportPreviewRow; recordId: string | null; merged: Record<string, unknown> }[]
) {
  const keyed = writes.map((write) => ({ ...write, key: assayKey(write.merged as Record<string, number | null>) }));

  const inImport = groupDuplicates(keyed.map(({ row, key }) => ({ id: row.line, key })));
  for (const { row } of keyed) {
    const lines = inImport.get(row.line);
    if (lines) row.duplicateLines = lines;
  }

  // Records written by this import are compared by their new results, above;
  // what they hold now is about to change.
  const written = keyed.flatMap(({ recordId }) => (recordId ? [recordId] : []));
  const unique = [...new Map(keyed.filter((entry) => entry.key !== null).map((entry) => [entry.key!, entry.merged])).entries()];
  const storedByKey = new Map<string, string[]>();
  for (let start = 0; start < unique.length; start += DUPLICATE_BATCH) {
    const batch = unique.slice(start, start + DUPLICATE_BATCH);
    const found = await prisma.labRecord.findMany({
      where: {
        ...ACTIVE_LAB_RECORD,
        ...(written.length ? { id: { notIn: written } } : {}),
        OR: batch.map(([, merged]) => assayWhere(merged as Record<string, number | null>)),
      },
      select: { labCode: true, sampleIdent: true, ...Object.fromEntries(ASSAY_KEYS.map((key) => [key, true])) },
      take: DUPLICATE_BATCH * DUPLICATES_NAMED,
    });
    for (const record of found) {
      const key = assayKey(record as unknown as Record<string, number | null>);
      if (key === null) continue;
      const names = storedByKey.get(key) ?? [];
      if (names.length < DUPLICATES_NAMED) storedByKey.set(key, [...names, record.sampleIdent ?? record.labCode]);
    }
  }
  for (const { row, key } of keyed) {
    const stored = key ? storedByKey.get(key) : undefined;
    if (stored) row.duplicateOf = stored;
  }
  return preview.filter((row) => row.duplicateLines || row.duplicateOf).length;
}

/** A record's results once a row is written: a column the sheet does not have keeps what is stored. */
function mergedAssay(record: Record<string, unknown>, values: Values): Record<string, unknown> {
  return Object.fromEntries(ASSAY_KEYS.map((field) => [field, field in values ? values[field] : record[field]]));
}

/** As with replacing results: saving look-alikes is a decision the request states. */
function refuseDuplicates(preview: ImportPreviewRow[], count: number, allowed: boolean) {
  if (count === 0 || allowed) return;
  throw new ApiError(
    `${count} row(s) have results that read exactly like another row's or another sample's.`,
    409,
    "duplicate",
    {
      duplicates: preview
        .filter((row) => row.duplicateLines || row.duplicateOf)
        .map((row) => ({ line: row.line, labCode: row.labCode, lines: row.duplicateLines, samples: row.duplicateOf })),
    }
  );
}

export const POST = route({ capability: "enterResults" }, async ({ request, session }) => {
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
  // Each row about to be written, with its results as they would stand after.
  const writes: { row: ImportPreviewRow; recordId: string | null; merged: Record<string, unknown> }[] = [];
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
      preview.push({ line, labCode: "", status: "invalid", changes: {}, message: `Missing ${noun}.`, field: "sampleIdent" });
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
        field: "sampleIdent",
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
        field: "sampleIdent",
      });
      return;
    }
    const target = match.status === "found" ? match.record : match.parent;
    const sampleCode = target.sample.sampleCode;

    const raw: Record<string, string | number | null> = {};
    let badCell: { message: string; field: string } | null = null;

    for (const field of fields) {
      const cell = readImportCell(field.key, (row[field.index] ?? "").trim());
      if ("error" in cell) {
        badCell ??= { message: cell.error, field: field.key };
        continue;
      }
      raw[field.key] = cell.value;
    }

    if (badCell) {
      preview.push({ line, labCode: key, sampleCode, status: "invalid", changes: {}, ...badCell });
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
        field: typeof issue.path[0] === "string" ? issue.path[0] : undefined,
      });
      return;
    }
    const values = parsed.data as Values;

    if (match.status === "newSub") {
      // Nothing is there yet, so everything filled in is a change.
      const changes = Object.fromEntries(
        Object.entries(diffLabRecord({} as DiffInput, values)).filter(([, change]) => change.to !== null)
      );
      const created: ImportPreviewRow = { line, labCode: key, sampleCode, status: "create", subCode: match.code, changes };
      preview.push(created);
      writes.push({ row: created, recordId: null, merged: values });
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
    const updated: ImportPreviewRow = {
      line,
      labCode: key,
      sampleCode,
      status: "update",
      changes,
      ...(overwrites.length ? { overwrites } : {}),
    };
    preview.push(updated);
    writes.push({ row: updated, recordId: match.record.id, merged: mergedAssay(record, values) });
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
    duplicate: writes.length ? await markDuplicates(preview, writes) : 0,
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

  refuseDuplicates(preview, summary.duplicate, body.duplicates);

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
});
