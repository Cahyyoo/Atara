import { DRILL_HOLE_FIELDS, type DrillHoleField } from "@/modules/eksplorasi/lib/drill-hole-columns";
import type { DrillHoleDTO, DrillHoleStatus } from "@/modules/eksplorasi/types";

/**
 * The drilling sheet's rows, as text: what is in each box. Pure, so what is
 * sent, what counts as changed and what a hole looks like on the sheet can be
 * checked without a browser.
 */

export type Cells = Partial<Record<DrillHoleField, string>>;

export interface SheetRow {
  /** Set on an existing hole; absent on a new row. */
  id?: string;
  /** An existing hole stays read-only until it is unlocked. */
  locked: boolean;
  /** An existing hole's cells as loaded, to tell what changed and to undo it. */
  original?: Cells;
  cells: Cells;
}

/** Empty rows under the existing holes when the sheet opens. */
export const SHEET_BLANK_ROWS = 20;
/** Existing holes shown above them, newest last. */
export const SHEET_RECENT_HOLES = 50;

export const blankRows = (count: number): SheetRow[] => Array.from({ length: count }, () => ({ locked: false, cells: {} }));

/** An existing hole as the sheet shows it: numbers as stored, dates YYYY-MM-DD, the status by its name. */
export function cellsOfHole(hole: DrillHoleDTO, statusLabel: (status: DrillHoleStatus) => string): Cells {
  const text = (value: string | number | null) => (value === null ? "" : String(value));
  return {
    holeId: hole.holeId,
    area: text(hole.area),
    status: statusLabel(hole.status),
    easting: text(hole.easting),
    northing: text(hole.northing),
    elevation: text(hole.elevation),
    azimuth: text(hole.azimuth),
    dip: text(hole.dip),
    totalDepth: text(hole.totalDepth),
    startDate: text(hole.startDate),
    endDate: text(hole.endDate),
    remarks: text(hole.remarks),
  };
}

/**
 * The latest holes with the one opened for editing among them, unlocked: in
 * its place when it is one of them, below them -- right above the empty
 * rows -- when it is older.
 */
export function withEditing(holes: readonly SheetRow[], editing: SheetRow | null): SheetRow[] {
  if (!editing) return [...holes];
  const at = holes.findIndex((row) => row.id === editing.id);
  if (at === -1) return [...holes, { ...editing, locked: false }];
  return holes.map((row, index) => (index === at ? { ...row, locked: false } : row));
}

export const isFilled =(cells: Cells) => DRILL_HOLE_FIELDS.some((field) => (cells[field] ?? "").trim() !== "");

/** Whether one box of an unlocked hole differs from what was loaded. */
export function isChangedCell(row: SheetRow, field: DrillHoleField): boolean {
  return row.id !== undefined && !row.locked && (row.cells[field] ?? "").trim() !== (row.original?.[field] ?? "").trim();
}

/** The rows the server has a say on: new rows with something in them, and every unlocked hole. */
export const isActive = (row: SheetRow) => !row.locked && (row.id !== undefined || isFilled(row.cells));

/** The active rows as the sheet route reads them, numbered by their place on the sheet. */
export function requestRows(rows: readonly SheetRow[]) {
  return rows.flatMap((row, index) =>
    isActive(row) ? [{ line: index + 1, ...(row.id ? { id: row.id } : {}), cells: row.cells }] : []
  );
}
