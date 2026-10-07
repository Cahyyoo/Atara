import { detectDelimiter, parseCsv } from "@/lib/csv-parse";
import { ASSAY_FIELDS } from "@/lib/assay";
import { fieldForHeader, parseNumber, readMeasurementFinished, TEXT_FIELDS } from "@/lib/paste-map";

/**
 * Reading a sheet of results -- pasted from Excel or uploaded as a CSV -- into
 * rows the import can match and check.
 *
 * Kept out of the route so it can be tested without a database, and so the
 * two ways in cannot drift: a block copied out of Excel arrives tab-separated
 * with comma decimals ("1,86"), a saved CSV arrives comma-separated with
 * points, and both have to mean the same numbers.
 */

/** One import is one transaction, so the row count has to stay something MySQL can finish. */
export const MAX_IMPORT_ROWS = 5_000;

/** Rows are matched on the Sample ID alone; a column headed Lab Code is read as one. */
export type ImportKeyColumn = "sampleIdent";

export interface ImportSheet {
  keyIndex: number;
  keyColumn: ImportKeyColumn;
  fields: { index: number; key: string }[];
  /** Data rows only, blank ones dropped, each with its line number in the sheet. */
  rows: { line: number; cells: string[] }[];
}

export type ImportSheetError = "empty" | "noKey" | "noFields" | "tooMany";

/**
 * Maps each column onto a lab-record field, ignoring columns we don't own.
 *
 * The headings come from the same list the paste dialog reads, so a sheet
 * exported from here means the same thing however it is fed back.
 */
function mapColumns(header: string[]) {
  const fields: { index: number; key: string }[] = [];
  let labCodeIndex = -1;
  let identIndex = -1;

  header.forEach((cell, index) => {
    const field = fieldForHeader(cell);
    if (field === null) return;

    if (field.kind === "value") {
      fields.push({ index, key: field.key });
      return;
    }
    // A date column is a value here; only the two id columns pick the row.
    if (field.key === "measurementFinished") {
      fields.push({ index, key: field.key });
    } else if (field.key === "labCode" && labCodeIndex === -1) {
      labCodeIndex = index;
    } else if (field.key === "sampleIdent" && identIndex === -1) {
      identIndex = index;
    }
  });

  return { labCodeIndex, identIndex, fields };
}

export function readImportSheet(
  text: string
): { ok: true; sheet: ImportSheet } | { ok: false; error: ImportSheetError; count?: number } {
  // Excel ends a copied block with a newline, and a selection dragged a row
  // too far brings blank lines with it; neither is a row anybody meant.
  // Blank lines are kept until they are numbered, so "row 7" in the preview
  // is row 7 in Excel.
  const all = parseCsv(text, detectDelimiter(text), true);
  const numbered = all
    .map((cells, index) => ({ line: index + 1, cells }))
    .filter((row) => row.cells.some((cell) => cell.trim() !== ""));

  if (numbered.length < 2) return { ok: false, error: "empty" };

  const [header, ...data] = numbered;
  const { labCodeIndex, identIndex, fields } = mapColumns(header.cells);
  if (labCodeIndex === -1 && identIndex === -1) return { ok: false, error: "noKey" };
  if (fields.length === 0) return { ok: false, error: "noFields" };
  if (data.length > MAX_IMPORT_ROWS) return { ok: false, error: "tooMany", count: data.length };

  // Rows are matched on the Sample ID. A column headed Lab Code is read as
  // one too -- the lab's sheets put the Sample ID there -- unless a column
  // headed Sample ID is also present, as on a sheet exported from here.
  return {
    ok: true,
    sheet: {
      keyIndex: identIndex === -1 ? labCodeIndex : identIndex,
      keyColumn: "sampleIdent",
      fields,
      rows: data,
    },
  };
}

/** Reads one cell the way its column says to, or returns the reason it could not. */
export function readImportCell(
  key: string,
  cell: string
): { value: string | number | null } | { error: string } {
  if (cell === "") return { value: null };
  if (TEXT_FIELDS.has(key as never)) return { value: cell };

  if (key === "measurementFinished") {
    // The same reader the paste dialog uses, so an uploaded sheet and a pasted
    // one cannot disagree about what a date means.
    const read = readMeasurementFinished(cell);
    if (read.ok) return { value: read.value.toISOString() };
    return {
      error:
        read.reason === "future"
          ? `${key}: "${cell}" is in the future, so it cannot be when a measurement finished. Check whether the sheet writes the month or the day first.`
          : `${key}: "${cell}" is not a date this import can read without guessing.`,
    };
  }

  // Comma decimals and thousands separators included: "1,86" is 1.86.
  const value = parseNumber(cell);
  return value === null ? { error: `${key}: "${cell}" is not a number.` } : { value };
}

/**
 * The heading row to show somebody who is about to build a sheet.
 *
 * Derived from the fields above rather than written out, because the two had
 * already drifted once: the import dialog listed five elements while this
 * importer accepted all eighteen plus the instrument's own columns, so anyone
 * following the example cut columns out of a sheet that needed no cutting.
 *
 * A hand-kept copy would drift again the next time a column is added. This
 * cannot: every name here is checked against `fieldForHeader` by its test, so
 * an example column the importer would ignore fails the build.
 */
export const IMPORT_EXAMPLE_COLUMNS: readonly string[] = [
  "Sample ID",
  "Measurement Finished",
  ...ASSAY_FIELDS.map((field) => field.csvLabel),
  "Measurement Method",
  "Solution ID",
];
