import { ASSAY_FIELDS, INSTRUMENT_EXPORT_ORDER, INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";

/** A row of the paste sheet: the Sample ID and the results typed or pasted beside it. */
export type SheetRow = Record<string, string>;

/** Empty rows the sheet opens with: enough to see it is a sheet, few enough to render at once. */
export const SHEET_START_ROWS = 30;
/** The import's own ceiling (MAX_IMPORT_ROWS): one save, one transaction. */
export const SHEET_MAX_ROWS = 5000;

/**
 * The sheet's columns, always in this order: the Sample ID, then exactly the
 * instrument's export -- Measurement Finished, the eighteen elements, Sum,
 * Measurement Method, Solution ID -- so a block copied out of that export
 * lands column for column; then the two the export does not carry.
 */
export const SHEET_COLUMN_ORDER = ["sampleIdent", ...INSTRUMENT_EXPORT_ORDER, "xrayInstrument", "remarks"] as const;

/**
 * A column's heading as the instrument's sheet writes it -- "Ni (%)",
 * "SiO2 (%)", "Measurement Finished" -- shown on screen and sent to the
 * import, which reads these same headings (fieldForHeader).
 */
export function sheetLabel(key: string): string {
  if (key === "sampleIdent") return "Sample ID";
  if (key === "remarks") return "Remarks";
  if (key === "sum") return "Sum (%)";
  const assay = ASSAY_FIELDS.find((field) => field.key === key);
  if (assay) return assay.csvLabel;
  return INSTRUMENT_FIELDS.find((field) => field.key === key)?.csvLabel ?? key;
}

function importCell(value: string | undefined): string {
  const text = (value ?? "").trim();
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row as one line of the import: tab-separated, in the columns' order. */
export function rowLine(row: SheetRow, keys: readonly string[]): string {
  return keys.map((key) => importCell(row[key])).join("\t");
}

/** Whether a line carries anything at all. */
export function isFilledLine(line: string): boolean {
  return line.replace(/\t/g, "").trim() !== "";
}

/**
 * The sheet as the import reads a pasted block: a header, then a line per row
 * down to the last one with anything in it. Empty rows in between stay as
 * empty lines, so the import's line numbers come back as row + 2 and every
 * verdict lands on the row it is about. Null for a sheet with nothing in it.
 */
export function sheetToImportText(
  rows: readonly SheetRow[],
  keys: readonly string[],
  line: (row: SheetRow) => string = (row) => rowLine(row, keys)
): string | null {
  const lines = rows.map(line);
  let last = lines.length - 1;
  while (last >= 0 && !isFilledLine(lines[last])) last--;
  if (last < 0) return null;
  return [keys.map(sheetLabel).join("\t"), ...lines.slice(0, last + 1).map((text) => (isFilledLine(text) ? text : ""))].join(
    "\n"
  );
}

/** Which row of the sheet an import verdict is about. */
export function rowOfLine(line: number): number {
  return line - 2;
}
