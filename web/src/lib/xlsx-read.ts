import "server-only";

import ExcelJS from "exceljs";

/**
 * Turning an uploaded workbook into the rows the importer already reads.
 *
 * The sheet is flattened to tab-separated text rather than to a second row
 * format, so `readImportSheet` stays the only thing that decides what a column
 * means. A workbook and a pasted block then differ in how they arrive and in
 * nothing else -- two readers would be two sets of rules, and the drift would
 * show up as a column that imports one way and not the other.
 *
 * Server-only: exceljs is large, it already lives on this side for writing
 * exports, and the matching happens here anyway.
 */

/** The first sheet only. A workbook of many is somebody's working file. */
const SHEET_INDEX = 1;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * One cell as the text the sheet shows.
 *
 * The date branch is the one that matters, and it is measured rather than
 * reasoned about. A cell showing "3/16/2026 10:34" comes back as a Date whose
 * *UTC* parts are that wall clock: toISOString() is "2026-03-16T10:34:00.000Z"
 * and getUTCHours() is 10. A spreadsheet date carries no zone, and this is how
 * exceljs represents that.
 *
 * So the UTC parts are read straight out. Both other readings are wrong by the
 * same eight hours on this machine: String(date) says 18:34, and converting
 * the instant to the lab's zone says 18:34 as well -- it would be treating a
 * wall clock as though it were already an instant somewhere else. Every
 * Measurement Finished from a workbook would have landed in the evening while
 * the identical column pasted as text landed correctly.
 *
 * Space rather than the "T" a datetime-local input wants: parseSheetDateTime
 * takes either, and this is what a spreadsheet shows.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    return (
      `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` +
      ` ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`
    );
  }

  if (typeof value === "object") {
    // A formula cell carries what it worked out; a rich-text cell carries its
    // runs; a hyperlink carries the words somebody sees.
    if ("result" in value && value.result !== undefined) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((run) => run.text).join("");
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return "";
    return "";
  }

  return String(value);
}

export type WorkbookError = "unreadable" | "noSheet";

/**
 * A workbook as tab-separated text, or the reason it could not be read.
 *
 * Tabs because that is what a block copied out of Excel already is, so
 * `detectDelimiter` reaches the same answer either way -- and a value with a
 * comma in it does not have to be quoted.
 */
/** Wider than any results sheet. Past this the columns are formatting, not data. */
const MAX_COLUMNS = 64;
/** The importer refuses more than 5,000 data rows; one header, one to be over. */
const MAX_ROWS = 5_002;

export async function readWorkbookAsText(
  data: ArrayBuffer
): Promise<{ ok: true; text: string } | { ok: false; error: WorkbookError }> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(data);
  } catch {
    // Not a workbook at all: a CSV renamed, a corrupt download, a .xls from
    // 2003. The caller says so in the reader's language.
    return { ok: false, error: "unreadable" };
  }

  const sheet = workbook.getWorksheet(SHEET_INDEX);
  if (!sheet) return { ok: false, error: "noSheet" };

  /**
   * Read once, outside the loop. `columnCount` walks every row to find the
   * widest, so reading it per cell made this rows x columns x rows: a
   * 5,000-row sheet was hundreds of millions of row visits with the whole
   * server frozen for the duration, and the importer's own row ceiling only
   * applied afterwards. Capped, because formatting dragged out to column XFD
   * is sixteen thousand columns of nothing.
   */
  const columns = Math.min(sheet.columnCount, MAX_COLUMNS);
  /**
   * Stopped just past the importer's ceiling rather than flattening a million
   * rows to be told there were too many. `rowCount` is the highest row that
   * holds anything, a stray format included, so a sheet with one cell at row
   * 1,048,576 stops here too.
   */
  const rows = Math.min(sheet.rowCount, MAX_ROWS);

  const lines: string[] = [];
  for (let number = 1; number <= rows; number += 1) {
    const row = sheet.getRow(number);
    const cells: string[] = [];
    // By column number, not by iterating the row: eachCell skips the empty
    // ones, which would shuffle every later value one column to the left.
    for (let column = 1; column <= columns; column += 1) {
      cells.push(cellText(row.getCell(column).value).replace(/[\t\r\n]+/g, " ").trim());
    }
    lines.push(cells.join("\t"));
  }

  return { ok: true, text: lines.join("\n") };
}
