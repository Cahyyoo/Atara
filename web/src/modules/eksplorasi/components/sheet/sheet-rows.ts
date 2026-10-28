import { DATA_SOURCE_FIELDS, ELEMENT_FIELDS, type DataSourceField } from "@/modules/eksplorasi/lib/data-source-columns";
import type { DataSourceDTO, SampleType } from "@/modules/eksplorasi/types";

/**
 * A sheet's rows, as text: what is in each box. Pure, so what is sent, what
 * counts as changed and what a sample looks like on the sheet can be checked
 * without a browser.
 */

export type Cells = Partial<Record<DataSourceField, string>>;

export interface SheetRow {
  /** Set on an existing sample; absent on a new row. */
  id?: string;
  /** An existing sample with assay results stays read-only until it is unlocked (hasAssay). */
  locked: boolean;
  /** An existing sample's cells as loaded, to tell what changed and to undo it. */
  original?: Cells;
  cells: Cells;
}

/** Empty rows under the existing samples when the sheet opens. */
export const SHEET_BLANK_ROWS = 20;
/** Existing samples shown above them, newest last. */
export const SHEET_RECENT_ROWS = 50;

export const blankRows = (count: number): SheetRow[] => Array.from({ length: count }, () => ({ locked: false, cells: {} }));

/** An existing sample as the sheet shows it: values as stored, the date YYYY-MM-DD, the type by its name. */
export function cellsOf(
  row: DataSourceDTO,
  fields: readonly DataSourceField[],
  typeLabel: (type: SampleType) => string
): Cells {
  return Object.fromEntries(
    fields.map((field) => [field, field === "sampleType" ? typeLabel(row.sampleType) : (row[field] ?? "")])
  );
}

/**
 * The latest samples with the one opened for editing among them, unlocked: in
 * its place when it is one of them, below them -- right above the empty
 * rows -- when it is older.
 */
export function withEditing(rows: readonly SheetRow[], editing: SheetRow | null): SheetRow[] {
  if (!editing) return [...rows];
  const at = rows.findIndex((row) => row.id === editing.id);
  if (at === -1) return [...rows, { ...editing, locked: false }];
  return rows.map((row, index) => (index === at ? { ...row, locked: false } : row));
}

/**
 * Whether a sample has any assay result -- one of the sixteen elements, even
 * "<0.01". A sample without one comes onto the sheet unlocked: its results
 * are what is left to type in, and a padlock in the way is only a click more.
 */
export const hasAssay = (cells: Cells) => ELEMENT_FIELDS.some((field) => (cells[field] ?? "").trim() !== "");

/** A loaded sample put back as it came: its cells as loaded, locked unless it has no assay yet. */
export function asLoaded(row: SheetRow): SheetRow {
  const original = row.original ?? {};
  return { ...row, locked: hasAssay(original), cells: original };
}

/** The loaded samples still locked, and those open -- no assay yet, or unlocked by hand. */
export function lockCounts(rows: readonly SheetRow[]): { lockedCount: number; openCount: number } {
  const loaded = rows.filter((row) => row.id !== undefined);
  const lockedCount = loaded.filter((row) => row.locked).length;
  return { lockedCount, openCount: loaded.length - lockedCount };
}

export const isFilled = (cells: Cells) => DATA_SOURCE_FIELDS.some((field) => (cells[field] ?? "").trim() !== "");

/** Whether one box of an unlocked sample differs from what was loaded. */
export function isChangedCell(row: SheetRow, field: DataSourceField): boolean {
  return row.id !== undefined && !row.locked && (row.cells[field] ?? "").trim() !== (row.original?.[field] ?? "").trim();
}

/** Work that would be lost on leaving: a new row with something in it, or an unlocked sample that was changed. */
export const isDirtyRow = (row: SheetRow) =>
  row.id === undefined ? isFilled(row.cells) : !row.locked && DATA_SOURCE_FIELDS.some((field) => isChangedCell(row, field));

/** The rows the server has a say on: new rows with something in them, and every unlocked sample. */
export const isActive = (row: SheetRow) => !row.locked && (row.id !== undefined || isFilled(row.cells));

/** The active rows as the sheet route reads them, numbered by their place on the sheet. */
export function requestRows(rows: readonly SheetRow[]) {
  return rows.flatMap((row, index) =>
    isActive(row) ? [{ line: index + 1, ...(row.id ? { id: row.id } : {}), cells: row.cells }] : []
  );
}
