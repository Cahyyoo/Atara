/**
 * One cell of a data-source sheet, read the same way wherever it comes from:
 * an uploaded file (data-source-import.ts) or a box of the sheet page as it
 * is typed or pasted into. Pure and small, so the page can use it too.
 */

/** A cell as the readers hand it over: text from a CSV, typed values from a workbook. */
export type Cell = string | number | Date | boolean | null | undefined;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Text of a cell. A workbook number is written back without the binary tail a
 * double can carry (0.30000000000000004), so a value reads as it was typed.
 */
export function textOf(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return ymdOf(cell);
  if (typeof cell === "number") return Number.isFinite(cell) ? String(Number(cell.toPrecision(12))) : "";
  return String(cell).trim();
}

/**
 * A workbook date is a wall clock stored as UTC (see xlsx-read.ts), so its
 * UTC parts are the day somebody typed.
 */
function ymdOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Excel's day 0 is 1899-12-30 (it counts the 1900 leap day that never was). */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * A date cell as YYYY-MM-DD. Takes a workbook date, an Excel serial number
 * (a date column the workbook never formatted), ISO, and the day-first
 * spellings an Indonesian sheet uses: 01/10/2026, 01-10-2026, 01.10.2026.
 */
export function readDateCell(cell: Cell): string | null | "invalid" {
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? "invalid" : ymdOf(cell);
  if (typeof cell === "number") {
    if (cell < 1 || cell > 2_958_465) return "invalid";
    return ymdOf(new Date(EXCEL_EPOCH + Math.floor(cell) * 86_400_000));
  }
  const text = textOf(cell);
  if (!text) return null;

  // A timestamp's time is dropped: the column is a day.
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(text);
  if (iso) {
    const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : "invalid";
  }
  const dayFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T].*)?$/.exec(text);
  if (dayFirst) {
    const [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : "invalid";
  }
  return "invalid";
}
