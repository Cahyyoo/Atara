import "server-only";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { parseCsv } from "@/core/lib/sheets/csv-parse";
import { detectCsvDelimiter, MAX_IMPORT_ROWS, type Cell, type SheetLine } from "@/modules/eksplorasi/lib/drill-hole-import";

/**
 * An uploaded drilling sheet as lines of cells, for readDrillHoleSheet.
 *
 * A workbook is streamed: tens of thousands of rows loaded whole through
 * ExcelJS would cost hundreds of megabytes for a sheet whose cells are read
 * once and thrown away. A CSV is text the size of the upload, so it is simply
 * read and split.
 */

export type FileKind = "xlsx" | "csv";

export type UploadRead = { ok: true; lines: SheetLine[] } | { ok: false; error: "unreadable" | "tooMany" };

/** By the name first -- browsers disagree about a CSV's MIME type. */
export function fileKindOf(file: File): FileKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) return "csv";
  if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (file.type === "text/csv") return "csv";
  return null;
}

/** The value a workbook cell shows: a formula's result, rich text's words, a link's text. */
function cellValue(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    if ("result" in value) return cellValue((value as { result: unknown }).result);
    if ("richText" in value) {
      return (value as { richText: { text: string }[] }).richText.map((run) => run.text).join("");
    }
    if ("text" in value && typeof (value as { text: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
  }
  return null;
}

/** The header, the rows, and one more to know the limit was passed. */
const LINE_CAP = MAX_IMPORT_ROWS + 1;

async function readWorkbook(file: File): Promise<UploadRead> {
  const lines: SheetLine[] = [];
  try {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(
      Readable.fromWeb(file.stream() as import("node:stream/web").ReadableStream),
      // Styles are what tell a date cell from a number; links and the rest
      // are not wanted.
      { worksheets: "emit", sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", entries: "ignore" }
    );
    for await (const worksheet of reader) {
      let dataRows = 0;
      for await (const row of worksheet) {
        // ExcelJS's row.values starts at index 1 (column A).
        const values = (row.values as unknown[]).slice(1).map(cellValue);
        lines.push({ line: row.number, cells: values });
        if (values.some((cell) => cell !== null && cell !== "")) dataRows += 1;
        if (dataRows > LINE_CAP) return { ok: false, error: "tooMany" };
      }
      // The first sheet only, like every other importer here.
      break;
    }
  } catch {
    return { ok: false, error: "unreadable" };
  }
  return { ok: true, lines };
}

async function readCsv(file: File): Promise<UploadRead> {
  const text = await file.text();
  // Blank lines are kept so each row keeps the number the spreadsheet shows;
  // the row limit is readDrillHoleSheet's to enforce.
  const rows = parseCsv(text, detectCsvDelimiter(text), true);
  return { ok: true, lines: rows.map((cells, index) => ({ line: index + 1, cells })) };
}

export function readUploadedSheet(file: File, kind: FileKind): Promise<UploadRead> {
  return kind === "xlsx" ? readWorkbook(file) : readCsv(file);
}
