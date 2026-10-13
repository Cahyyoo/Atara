import { z } from "zod";
import { importDrillHoleRowSchema } from "@/modules/eksplorasi/validation";
import { parseNumber } from "@/core/lib/number-parse";
import { DRILL_HOLE_STATUSES } from "@/modules/eksplorasi/lib/drill-hole";
import {
  DRILL_HOLE_NUMBER_FIELDS,
  fieldForHeader,
  type DrillHoleField,
} from "@/modules/eksplorasi/lib/drill-hole-columns";
import type { DrillHoleStatus } from "@/modules/eksplorasi/types";

/**
 * Reading a drilling sheet: from cells to rows that are ready to write, and
 * the reasons the others are not.
 *
 * Pure. The file readers (drill-hole-file.ts) turn a CSV or a workbook into
 * lines of cells; everything a cell may mean is decided here, once, for both.
 *
 * Every row is read and every problem reported -- not just the first -- so a
 * 34,000-row file with forty bad rows comes back as forty lines to fix rather
 * than forty round trips.
 */

/**
 * Comfortably above the files this was built for (about 34,000 rows), and
 * refused outright above it rather than cut short: a sheet that silently lost
 * its tail is worse than one that was turned away.
 */
export const MAX_IMPORT_ROWS = 50_000;

/** A cell as the readers hand it over: text from a CSV, typed values from a workbook. */
export type Cell = string | number | Date | boolean | null | undefined;

/** One line of the sheet, numbered the way the spreadsheet numbers it. */
export interface SheetLine {
  line: number;
  cells: Cell[];
}

export type DrillHoleImportRow = z.infer<typeof importDrillHoleRowSchema>;

export interface ImportRow {
  line: number;
  data: DrillHoleImportRow;
}

export interface ImportError {
  line: number;
  holeId: string | null;
  /** The column at fault, or null for a problem with the row as a whole. */
  field: DrillHoleField | null;
  message: string;
}

export type SheetReadError = "empty" | "noHoleId" | "tooMany";

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
    }
  | { ok: false; error: SheetReadError };

const pad = (n: number) => String(n).padStart(2, "0");

/** Text of a cell, for the fields that are text and for the error report. */
function textOf(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return ymdOf(cell);
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

/** A number cell, or "invalid" for text that is not one. */
export function readNumberCell(cell: Cell): number | null | "invalid" {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : "invalid";
  const text = textOf(cell);
  if (!text) return null;
  return parseNumber(text) ?? "invalid";
}

/** The codes, and the words the screen shows in either language. */
const STATUS_WORDS = new Map<string, DrillHoleStatus>([
  ...DRILL_HOLE_STATUSES.map((status) => [status.toLowerCase(), status] as const),
  ["planned", "PLANNED"],
  ["plan", "PLANNED"],
  ["direncanakan", "PLANNED"],
  ["rencana", "PLANNED"],
  ["ongoing", "ONGOING"],
  ["in progress", "ONGOING"],
  ["berjalan", "ONGOING"],
  ["proses", "ONGOING"],
  ["completed", "COMPLETED"],
  ["complete", "COMPLETED"],
  ["done", "COMPLETED"],
  ["selesai", "COMPLETED"],
  ["abandoned", "ABANDONED"],
  ["cancelled", "ABANDONED"],
  ["canceled", "ABANDONED"],
  ["dibatalkan", "ABANDONED"],
  ["batal", "ABANDONED"],
]);

export function readStatusCell(cell: Cell): DrillHoleStatus | null | "invalid" {
  const text = textOf(cell).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  return STATUS_WORDS.get(text) ?? "invalid";
}

const isBlankLine = (cells: Cell[]) => cells.every((cell) => textOf(cell) === "");

/**
 * The sheet's rows, read and validated.
 *
 * The header is the first line that is not blank. A hole ID that appears
 * twice is an error from its second appearance on, compared without case or
 * surrounding spaces the way the database's unique index compares them -- so
 * the file cannot fight itself over which version of a hole wins.
 */
export function readDrillHoleSheet(lines: Iterable<SheetLine>): SheetRead {
  let columns: (DrillHoleField | null)[] | null = null;
  const ignoredHeaders: string[] = [];
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Map<string, number>();
  let total = 0;
  let invalid = 0;

  for (const { line, cells } of lines) {
    if (isBlankLine(cells)) continue;

    if (columns === null) {
      const fields = new Set<DrillHoleField>();
      columns = cells.map((cell) => {
        const header = textOf(cell);
        const field = header ? fieldForHeader(header) : null;
        // A column named twice is read from its first appearance only.
        if (field === null || fields.has(field)) {
          if (header) ignoredHeaders.push(header);
          return null;
        }
        fields.add(field);
        return field;
      });
      if (!fields.has("holeId")) return { ok: false, error: "noHoleId" };
      continue;
    }

    total += 1;
    if (total > MAX_IMPORT_ROWS) return { ok: false, error: "tooMany" };

    const rowErrors: ImportError[] = [];
    const raw: Partial<Record<DrillHoleField, unknown>> = {};
    const holeIdText = textOf(cells[columns.indexOf("holeId")]) || null;
    const fail = (field: DrillHoleField | null, message: string) =>
      rowErrors.push({ line, holeId: holeIdText, field, message });

    columns.forEach((field, index) => {
      if (field === null) return;
      const cell = cells[index];
      if ((DRILL_HOLE_NUMBER_FIELDS as readonly string[]).includes(field)) {
        const value = readNumberCell(cell);
        if (value === "invalid") fail(field, `"${textOf(cell)}" is not a number.`);
        else raw[field] = value;
      } else if (field === "startDate" || field === "endDate") {
        const value = readDateCell(cell);
        if (value === "invalid") fail(field, `"${textOf(cell)}" is not a date (use YYYY-MM-DD or DD/MM/YYYY).`);
        else raw[field] = value;
      } else if (field === "status") {
        const value = readStatusCell(cell);
        if (value === "invalid") {
          fail(field, `"${textOf(cell)}" is not a status (PLANNED, ONGOING, COMPLETED, ABANDONED).`);
        } else if (value !== null) {
          raw.status = value;
        }
      } else {
        raw[field] = textOf(cell) || null;
      }
    });

    if (rowErrors.length === 0) {
      const parsed = importDrillHoleRowSchema.safeParse(raw);
      if (parsed.success) {
        const key = parsed.data.holeId.toLowerCase();
        const first = seen.get(key);
        if (first !== undefined) {
          fail("holeId", `Hole ID "${parsed.data.holeId}" already appears on line ${first}.`);
        } else {
          seen.set(key, line);
          rows.push({ line, data: parsed.data });
        }
      } else {
        for (const issue of parsed.error.issues) {
          const field = (issue.path[0] as DrillHoleField | undefined) ?? null;
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
  return { ok: true, rows, errors, total, invalid, ignoredHeaders };
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
