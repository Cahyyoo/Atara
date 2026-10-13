import { INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";

/** A row of the paste sheet: the Sample ID and the results typed or pasted beside it. */
export type SheetRow = Record<string, string>;

/** Empty rows the sheet opens with: enough to see it is a sheet, few enough to render at once. */
export const SHEET_START_ROWS = 30;
/** The import's own ceiling (MAX_IMPORT_ROWS): one save, one transaction. */
export const SHEET_MAX_ROWS = 5000;

/** The heading the import reads for a column (fieldForHeader), which is not always its label on screen. */
export function importHeader(key: string): string {
  if (key === "sampleIdent") return "Sample ID";
  if (key === "remarks") return "Remarks";
  return INSTRUMENT_FIELDS.find((field) => field.key === key)?.csvLabel ?? key;
}

function importCell(value: string | undefined): string {
  const text = (value ?? "").trim();
  // A date-time box holds "2026-03-16T10:34"; the import reads "2026-03-16 10:34".
  const sheet = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? text.replace("T", " ") : text;
  return /[\t\n\r"]/.test(sheet) ? `"${sheet.replace(/"/g, '""')}"` : sheet;
}

/**
 * The sheet as the import reads a pasted block: a header, then a line per row
 * down to the last one with anything in it. Empty rows in between stay as
 * empty lines, so the import's line numbers come back as row + 2 and every
 * verdict lands on the row it is about. Null for a sheet with nothing in it.
 */
export function sheetToImportText(rows: readonly SheetRow[], keys: readonly string[]): string | null {
  let last = -1;
  rows.forEach((row, index) => {
    if (keys.some((key) => (row[key] ?? "").trim() !== "")) last = index;
  });
  if (last < 0) return null;

  const lines = [keys.map(importHeader).join("\t")];
  for (let index = 0; index <= last; index++) {
    const cells = keys.map((key) => importCell(rows[index][key]));
    lines.push(cells.every((cell) => cell === "") ? "" : cells.join("\t"));
  }
  return lines.join("\n");
}

/** Which row of the sheet an import verdict is about. */
export function rowOfLine(line: number): number {
  return line - 2;
}
