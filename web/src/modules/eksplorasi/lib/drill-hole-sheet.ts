import "server-only";
import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import {
  DRILL_HOLE_COLUMNS,
  DRILL_HOLE_FIELDS,
  type DrillHoleField,
  type DrillHoleNumberField,
} from "@/modules/eksplorasi/lib/drill-hole-columns";
import { readDrillHoleSheet, type DrillHoleImportRow, type SheetLine } from "@/modules/eksplorasi/lib/drill-hole-import";
import { findExistingHoles } from "@/modules/eksplorasi/lib/drill-hole-upsert";
import { toDateColumn } from "@/modules/eksplorasi/lib/drill-hole";
import type { drillHoleSheetSchema } from "@/modules/eksplorasi/validation";
import type { DrillHoleStatus, DrillSheetResult, DrillSheetStatus, DrillSheetVerdict } from "@/modules/eksplorasi/types";

/**
 * The drilling sheet: new holes typed or pasted row by row, and existing ones
 * unlocked and changed in place, checked and saved together.
 *
 * Cells are read exactly as an imported file is (readDrillHoleSheet): the
 * same decimal comma, the same day-first dates, the same status words, the
 * same rules. What differs is what a row means. A new row may not take a hole
 * ID already in use -- the sheet adds holes, the import is for updating them
 * in bulk -- and on an unlocked row a blank cell clears the column, because
 * the whole row is on screen and emptying a box is a decision.
 *
 * Nothing is written while any row is invalid: the sheet is saved whole, in
 * one transaction, or not at all.
 */

type SheetBody = z.output<typeof drillHoleSheetSchema>;

/** Decimal places each number column stores (eksplorasi.prisma), so "123.4567" compares as it will be kept. */
const SCALE: Record<DrillHoleNumberField, number> = {
  easting: 3,
  northing: 3,
  elevation: 2,
  azimuth: 2,
  dip: 2,
  totalDepth: 2,
};

/**
 * Rounded the way the DECIMAL column rounds, half up on the written digits:
 * shifted through the exponent rather than multiplied, so 150.255 is 150.26
 * and not the 150.25 its binary double would give.
 */
const round = (value: number | null | undefined, places: number) =>
  value === null || value === undefined ? null : Number(`${Math.round(Number(`${value}e${places}`))}e-${places}`);

/** A row's values as the columns will hold them; the status is left to the caller. */
function valuesOf(data: DrillHoleImportRow) {
  return {
    holeId: data.holeId,
    area: data.area || null,
    easting: round(data.easting, SCALE.easting),
    northing: round(data.northing, SCALE.northing),
    elevation: round(data.elevation, SCALE.elevation),
    azimuth: round(data.azimuth, SCALE.azimuth),
    dip: round(data.dip, SCALE.dip),
    totalDepth: round(data.totalDepth, SCALE.totalDepth),
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    remarks: data.remarks || null,
  };
}

type HoleValues = ReturnType<typeof valuesOf> & { status: DrillHoleStatus };

const STORED = {
  id: true,
  holeId: true,
  status: true,
  area: true,
  easting: true,
  northing: true,
  elevation: true,
  azimuth: true,
  dip: true,
  totalDepth: true,
  startDate: true,
  endDate: true,
  remarks: true,
} satisfies Prisma.DrillHoleSelect;

function storedValues(row: Prisma.DrillHoleGetPayload<{ select: typeof STORED }>): HoleValues {
  const num = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());
  const day = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));
  return {
    holeId: row.holeId,
    status: row.status,
    area: row.area,
    easting: num(row.easting),
    northing: num(row.northing),
    elevation: num(row.elevation),
    azimuth: num(row.azimuth),
    dip: num(row.dip),
    totalDepth: num(row.totalDepth),
    startDate: day(row.startDate),
    endDate: day(row.endDate),
    remarks: row.remarks,
  };
}

function columnsOf(values: HoleValues) {
  return {
    ...values,
    startDate: toDateColumn(values.startDate) ?? null,
    endDate: toDateColumn(values.endDate) ?? null,
  };
}

const isBlank = (cells: Partial<Record<DrillHoleField, string>>) =>
  DRILL_HOLE_FIELDS.every((field) => (cells[field] ?? "").trim() === "");

/** Checks the sheet's rows and, unless it is a dry run or any row is invalid, saves them. */
export async function applyDrillHoleSheet(body: SheetBody, userId: string): Promise<DrillSheetResult> {
  const verdicts = new Map<number, DrillSheetVerdict>();
  const fail = (line: number, field: DrillHoleField | null, message: string) => {
    if (!verdicts.has(line)) verdicts.set(line, { line, status: "invalid", field, message });
  };

  const ids = new Map(body.rows.flatMap((row) => (row.id ? [[row.line, row.id] as const] : [])));
  // An unlocked hole emptied out is not a row to skip: it would be a hole with no ID.
  for (const row of body.rows) if (row.id && isBlank(row.cells)) fail(row.line, "holeId", "Hole ID is required.");

  const header: SheetLine = { line: 0, cells: DRILL_HOLE_COLUMNS.map((column) => column.header) };
  const lines = body.rows.map((row) => ({ line: row.line, cells: DRILL_HOLE_FIELDS.map((field) => row.cells[field] ?? "") }));
  const read = readDrillHoleSheet([header, ...lines]);
  const rows = read.ok ? read.rows : [];
  if (read.ok) for (const error of read.errors) fail(error.line, error.field, error.message);

  const existing = await findExistingHoles(rows.map((row) => row.data.holeId));
  const unlocked = rows.flatMap((row) => ids.get(row.line) ?? []);
  const stored = new Map(
    (await prisma.drillHole.findMany({ where: { id: { in: unlocked } }, select: STORED })).map((row) => [
      row.id,
      storedValues(row),
    ])
  );

  const creates: HoleValues[] = [];
  const updates: { id: string; values: HoleValues }[] = [];
  for (const row of rows) {
    const id = ids.get(row.line);
    const owner = existing.get(row.data.holeId.toLowerCase());
    const values = valuesOf(row.data);

    if (id === undefined) {
      if (owner) {
        fail(row.line, "holeId", `Hole ID "${row.data.holeId}" already exists.`);
      } else {
        creates.push({ ...values, status: row.data.status ?? "PLANNED" });
        verdicts.set(row.line, { line: row.line, status: "create" });
      }
      continue;
    }

    const before = stored.get(id);
    if (!before) {
      fail(row.line, null, "This hole no longer exists.");
      continue;
    }
    if (owner && owner !== id) {
      fail(row.line, "holeId", `Hole ID "${row.data.holeId}" is used by another hole.`);
      continue;
    }
    // A blank status keeps the stored one: a hole always has a status.
    const after: HoleValues = { ...values, status: row.data.status ?? before.status };
    const changed = (Object.keys(after) as (keyof HoleValues)[]).some((key) => after[key] !== before[key]);
    if (changed) updates.push({ id, values: after });
    verdicts.set(row.line, { line: row.line, status: changed ? "update" : "unchanged" });
  }

  const result = [...verdicts.values()].sort((a, b) => a.line - b.line);
  const summary: Record<DrillSheetStatus, number> = { create: 0, update: 0, unchanged: 0, invalid: 0 };
  for (const verdict of result) summary[verdict.status] += 1;

  if (body.dryRun || summary.invalid > 0 || creates.length + updates.length === 0) {
    return { rows: result, summary, created: 0, updated: 0 };
  }

  // One transaction: a hole ID taken between the check and this write fails
  // the whole save (409), rather than leaving half of the sheet behind.
  await prisma.$transaction(async (tx) => {
    if (creates.length > 0) {
      await tx.drillHole.createMany({ data: creates.map((values) => ({ ...columnsOf(values), createdById: userId })) });
    }
    for (const { id, values } of updates) {
      await tx.drillHole.update({ where: { id }, data: { ...columnsOf(values), updatedById: userId } });
    }
  });
  return { rows: result, summary, created: creates.length, updated: updates.length };
}
