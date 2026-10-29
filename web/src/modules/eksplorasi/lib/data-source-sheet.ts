import "server-only";
import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import {
  DATA_SOURCE_FIELDS,
  HEADERS,
  VIEWS,
  viewFields,
  type DataSourceField,
} from "@/modules/eksplorasi/lib/data-source-columns";
import { readDataSourceSheet, type DataSourceImportRow, type SheetLine } from "@/modules/eksplorasi/lib/data-source-import";
import { findExistingSamples } from "@/modules/eksplorasi/lib/data-source-upsert";
import { DATA_SOURCE_SELECT, toDataSourceDTO, toDateColumn } from "@/modules/eksplorasi/lib/data-source";
import { isBlankRemark, matchOreas } from "@/modules/eksplorasi/lib/oreas-match";
import { oreasStandards } from "@/modules/eksplorasi/lib/crm-list-service";
import { invalidateDataSourceCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import type { dataSourceSheetSchema } from "@/modules/eksplorasi/validation";
import type { DataSourceDTO, SheetResult, SheetStatus, SheetVerdict } from "@/modules/eksplorasi/types";

/**
 * A list's sheet: new rows typed or pasted row by row, and existing ones
 * unlocked and changed in place, checked and saved together.
 *
 * Cells are read exactly as an imported file is (readDataSourceSheet): the
 * same day-first dates, the same sample-type words, the same rules, and on a
 * QC list the same type for every row. What differs is what a row means. A
 * new row may not take a sample ID already in use -- the sheet adds rows, the
 * import is for updating them in bulk -- and on an unlocked row a blank cell
 * clears the column, because the whole row is on screen and emptying a box is
 * a decision. Columns the list does not show are left as they are.
 *
 * Nothing is written while any row is invalid: the sheet is saved whole, in
 * one transaction, or not at all.
 */

type SheetBody = z.output<typeof dataSourceSheetSchema>;

/** A row's values for the columns the sheet has, as they will be kept. */
type Values = Partial<Record<DataSourceField, string | null>>;

function valuesOf(data: DataSourceImportRow, fields: readonly DataSourceField[]): Values {
  return Object.fromEntries(fields.map((field) => [field, data[field] || null]));
}

/** A stored row in the same terms, for telling what changed. */
function storedValues(row: DataSourceDTO, fields: readonly DataSourceField[]): Values {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function columnsOf(values: Values) {
  const { date, ...rest } = values;
  return { ...rest, ...(date !== undefined ? { date: toDateColumn(date) } : {}) };
}

const isBlank = (cells: Partial<Record<DataSourceField, string>>) =>
  DATA_SOURCE_FIELDS.every((field) => (cells[field] ?? "").trim() === "");

/** Checks the sheet's rows and, unless it is a dry run or any row is invalid, saves them. */
export async function applyDataSourceSheet(body: SheetBody, userId: string): Promise<SheetResult> {
  const fields = viewFields(body.view);
  const fixedType = VIEWS[body.view].sampleType;
  const verdicts = new Map<number, SheetVerdict>();
  const fail = (line: number, field: DataSourceField | null, message: string) => {
    if (!verdicts.has(line)) verdicts.set(line, { line, status: "invalid", field, message });
  };

  const ids = new Map(body.rows.flatMap((row) => (row.id ? [[row.line, row.id] as const] : [])));
  // An unlocked row emptied out is not a row to skip: it would be a sample with no ID.
  for (const row of body.rows) if (row.id && isBlank(row.cells)) fail(row.line, "sampleId", "Sample ID is required.");

  const header: SheetLine = { line: 0, cells: fields.map((field) => HEADERS[field]) };
  const lines = body.rows.map((row) => ({ line: row.line, cells: fields.map((field) => row.cells[field] ?? "") }));
  const read = readDataSourceSheet([header, ...lines], fixedType);
  const rows = read.ok ? read.rows : [];
  if (read.ok) for (const error of read.errors) fail(error.line, error.field, error.message);

  const existing = await findExistingSamples(rows.map((row) => row.data.sampleId));
  const unlocked = rows.flatMap((row) => ids.get(row.line) ?? []);
  const stored = new Map(
    (
      await prisma.dataSource.findMany({ where: { id: { in: unlocked } }, select: DATA_SOURCE_SELECT })
    ).map((row) => [row.id, toDataSourceDTO(row)])
  );

  // The type is always a column of the row, whether the list shows it or not.
  const written: readonly DataSourceField[] = fields.includes("sampleType") ? fields : [...fields, "sampleType"];

  /**
   * A row whose five values are an OREAS standard's gets that name as its
   * Remarks -- only when it has none, sent or stored, so a remark somebody
   * wrote is never replaced. The sheet fills the box as it is typed in; this
   * holds the same rule for whatever reaches the server another way. Lists
   * without the column (Duplicate) are left alone.
   */
  const standards = written.includes("oreasRemarks") ? await oreasStandards() : [];
  const withOreas = (values: Values, storedRemark: string | null): Values => {
    if (standards.length === 0 || !isBlankRemark(values.oreasRemarks) || !isBlankRemark(storedRemark)) return values;
    const name = matchOreas(values, standards);
    return name ? { ...values, oreasRemarks: name } : values;
  };

  const creates: Values[] = [];
  const updates: { id: string; values: Values }[] = [];
  for (const row of rows) {
    const id = ids.get(row.line);
    const owner = existing.get(row.data.sampleId.toLowerCase());
    const before = id === undefined ? undefined : stored.get(id);
    const values = withOreas(valuesOf(row.data, written), before?.oreasRemarks ?? null);

    if (id === undefined) {
      if (owner) {
        fail(row.line, "sampleId", `Sample ID "${row.data.sampleId}" already exists.`);
      } else {
        creates.push(values);
        verdicts.set(row.line, { line: row.line, status: "create" });
      }
      continue;
    }

    if (!before) {
      fail(row.line, null, "This sample no longer exists.");
      continue;
    }
    if (owner && owner !== id) {
      fail(row.line, "sampleId", `Sample ID "${row.data.sampleId}" is used by another sample.`);
      continue;
    }
    const was = storedValues(before, written);
    const changed = written.some((field) => values[field] !== was[field]);
    if (changed) updates.push({ id, values });
    verdicts.set(row.line, { line: row.line, status: changed ? "update" : "unchanged" });
  }

  const result = [...verdicts.values()].sort((a, b) => a.line - b.line);
  const summary: Record<SheetStatus, number> = { create: 0, update: 0, unchanged: 0, invalid: 0 };
  for (const verdict of result) summary[verdict.status] += 1;

  if (body.dryRun || summary.invalid > 0 || creates.length + updates.length === 0) {
    return { rows: result, summary, created: 0, updated: 0 };
  }

  // One transaction: a sample ID taken between the check and this write fails
  // the whole save (409), rather than leaving half of the sheet behind.
  await prisma.$transaction(async (tx) => {
    if (creates.length > 0) {
      await tx.dataSource.createMany({
        data: creates.map((values) => ({ ...columnsOf(values), createdById: userId }) as Prisma.DataSourceCreateManyInput),
      });
    }
    for (const { id, values } of updates) {
      await tx.dataSource.update({ where: { id }, data: { ...columnsOf(values), updatedById: userId } as Prisma.DataSourceUpdateInput });
    }
  });
  invalidateDataSourceCaches();
  return { rows: result, summary, created: creates.length, updated: updates.length };
}
