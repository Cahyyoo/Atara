import { z } from "zod";
import { createDataSourceSchema } from "@/modules/eksplorasi/validation";
import {
  fieldForHeader,
  SAMPLE_TYPES,
  viewOfType,
  type DataSourceField,
  type SampleType,
} from "@/modules/eksplorasi/lib/data-source-columns";

/**
 * Reading a data-source sheet: from cells to rows that are ready to write, and
 * the reasons the others are not.
 *
 * Pure. The file readers (data-source-file.ts) turn a CSV or a workbook into
 * lines of cells; everything a cell may mean is decided here, once, for both
 * -- and for the sheet page, which sends its boxes through the same reader.
 *
 * Every row is read and every problem reported -- not just the first -- so a
 * 34,000-row file with forty bad rows comes back as forty lines to fix rather
 * than forty round trips.
 */

/**
 * Comfortably above the files this was built for, and refused outright above
 * it rather than cut short: a sheet that silently lost its tail is worse than
 * one that was turned away.
 */
export const MAX_IMPORT_ROWS = 50_000;

/** A cell as the readers hand it over: text from a CSV, typed values from a workbook. */
export type Cell = string | number | Date | boolean | null | undefined;

/** One line of the sheet, numbered the way the spreadsheet numbers it. */
export interface SheetLine {
  line: number;
  cells: Cell[];
}

/**
 * A row as read. Columns the sheet does not have are undefined -- on an
 * existing row they are left alone -- and a blank cell is null.
 */
export type DataSourceImportRow = z.infer<typeof createDataSourceSchema>;

export interface ImportRow {
  line: number;
  data: DataSourceImportRow;
}

export interface ImportError {
  line: number;
  sampleId: string | null;
  /** The column at fault, or null for a problem with the row as a whole. */
  field: DataSourceField | null;
  message: string;
}

export type SheetReadError = "empty" | "noSampleId" | "noSampleType" | "tooMany";

export type SheetRead =
  | {
      ok: true;
      /** Rows that passed, in sheet order. */
      rows: ImportRow[];
      errors: ImportError[];
      /** Data rows read, blank lines not counted. */
      total: number;
      /** The rows with at least one error. */
      invalid: number;
      /** Headers that did not name a column, ignored. */
      ignoredHeaders: string[];
      /** The columns the sheet has, in its order. */
      fields: DataSourceField[];
    }
  | { ok: false; error: SheetReadError };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Text of a cell. A workbook number is written back without the binary tail a
 * double can carry (0.30000000000000004), so a value reads as it was typed.
 */
function textOf(cell: Cell): string {
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

/**
 * The codes, and the words the lab's sheets and the screen use for them. A
 * field sample was called ORIGINAL once; files written then still read.
 */
const TYPE_WORDS = new Map<string, SampleType>([
  ...SAMPLE_TYPES.map((type) => [type.toLowerCase(), type] as const),
  ["field sample", "FIELD"],
  ["sampel lapangan", "FIELD"],
  ["original", "FIELD"],
  ["ori", "FIELD"],
  ["orig", "FIELD"],
  ["sample", "FIELD"],
  ["sampel", "FIELD"],
  ["sampel biasa", "FIELD"],
  ["primary", "FIELD"],
  ["standard", "STANDARD"],
  ["standart", "STANDARD"],
  ["standar", "STANDARD"],
  ["std", "STANDARD"],
  ["crm", "STANDARD"],
  ["standard crm", "STANDARD"],
  ["standar crm", "STANDARD"],
  ["blank", "BLANK"],
  ["blk", "BLANK"],
  ["duplicate", "DUPLICATE"],
  ["duplikat", "DUPLICATE"],
  ["dup", "DUPLICATE"],
  ["dupl", "DUPLICATE"],
]);

export function readSampleTypeCell(cell: Cell): SampleType | null | "invalid" {
  const text = textOf(cell)
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return TYPE_WORDS.get(text) ?? "invalid";
}

const isBlankLine = (cells: Cell[]) => cells.every((cell) => textOf(cell) === "");

const TYPE_HINT = "FIELD, STANDARD, BLANK or DUPLICATE";

/**
 * The sheet's rows, read and validated.
 *
 * The header is the first line that is not blank. A sample ID that appears
 * twice is an error from its second appearance on, compared without case the
 * way the database's unique index compares them -- so the file cannot fight
 * itself over which version of a sample wins.
 *
 * `fixedType` is the type of the list the sheet is read for. A QC list's file
 * may leave the type out, and every row is that type; a row of another type
 * does not belong there and is refused. On the data source every row names
 * its own type.
 */
export function readDataSourceSheet(lines: Iterable<SheetLine>, fixedType: SampleType | null = null): SheetRead {
  // The list the file is for: its Remarks column is that list's own.
  const view = fixedType ? viewOfType(fixedType) : "dataSource";
  let columns: (DataSourceField | null)[] | null = null;
  const fields: DataSourceField[] = [];
  const ignoredHeaders: string[] = [];
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Map<string, number>();
  let total = 0;
  let invalid = 0;

  for (const { line, cells } of lines) {
    if (isBlankLine(cells)) continue;

    if (columns === null) {
      columns = cells.map((cell) => {
        const header = textOf(cell);
        const field = header ? fieldForHeader(header, view) : null;
        // A column named twice is read from its first appearance only.
        if (field === null || fields.includes(field)) {
          if (header) ignoredHeaders.push(header);
          return null;
        }
        fields.push(field);
        return field;
      });
      if (!fields.includes("sampleId")) return { ok: false, error: "noSampleId" };
      if (!fixedType && !fields.includes("sampleType")) return { ok: false, error: "noSampleType" };
      continue;
    }

    total += 1;
    if (total > MAX_IMPORT_ROWS) return { ok: false, error: "tooMany" };

    const rowErrors: ImportError[] = [];
    const raw: Partial<Record<DataSourceField, unknown>> = {};
    const sampleIdText = textOf(cells[columns.indexOf("sampleId")]) || null;
    const fail = (field: DataSourceField | null, message: string) =>
      rowErrors.push({ line, sampleId: sampleIdText, field, message });

    columns.forEach((field, index) => {
      if (field === null) return;
      const cell = cells[index];
      if (field === "date") {
        const value = readDateCell(cell);
        if (value === "invalid") fail(field, `"${textOf(cell)}" is not a date (use YYYY-MM-DD or DD/MM/YYYY).`);
        else raw.date = value;
      } else if (field === "sampleType") {
        const value = readSampleTypeCell(cell);
        if (value === "invalid") fail(field, `"${textOf(cell)}" is not a sample type (${TYPE_HINT}).`);
        else if (value !== null) raw.sampleType = value;
      } else {
        raw[field] = textOf(cell) || null;
      }
    });

    if (fixedType) {
      if (raw.sampleType === undefined) raw.sampleType = fixedType;
      else if (raw.sampleType !== fixedType) {
        fail("sampleType", `A ${String(raw.sampleType)} row does not belong in the ${fixedType} list.`);
      }
    } else if (raw.sampleType === undefined && !rowErrors.some((error) => error.field === "sampleType")) {
      fail("sampleType", `Sample type is required (${TYPE_HINT}).`);
    }

    if (rowErrors.length === 0) {
      const parsed = createDataSourceSchema.safeParse(raw);
      if (parsed.success) {
        const key = parsed.data.sampleId.toLowerCase();
        const first = seen.get(key);
        if (first !== undefined) {
          fail("sampleId", `Sample ID "${parsed.data.sampleId}" already appears on line ${first}.`);
        } else {
          seen.set(key, line);
          rows.push({ line, data: parsed.data });
        }
      } else {
        for (const issue of parsed.error.issues) {
          const field = (issue.path[0] as DataSourceField | undefined) ?? null;
          fail(field, issue.message);
        }
      }
    }

    if (rowErrors.length > 0) {
      invalid += 1;
      errors.push(...rowErrors);
    }
  }

  if (columns === null) return { ok: false, error: "empty" };
  return { ok: true, rows, errors, total, invalid, ignoredHeaders, fields };
}

/**
 * The separator a CSV was written with, read off its first non-blank line:
 * tab (copied from a sheet), semicolon (Excel's "CSV" in a locale whose
 * decimal mark is the comma -- Indonesian among them) or comma.
 */
export function detectCsvDelimiter(text: string): "\t" | ";" | "," {
  const first = text.replace(/^﻿/, "").split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  // Outside quotes only: a quoted "Blok A, utara" says nothing about the file.
  const unquoted = first.replace(/"[^"]*"/g, "");
  const count = (char: string) => unquoted.split(char).length - 1;
  const tabs = count("\t");
  const semicolons = count(";");
  const commas = count(",");
  if (tabs > 0 && tabs >= semicolons && tabs >= commas) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}
