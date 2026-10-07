import { once } from "node:events";
import { Readable, PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { CSV_BOM, csvLine } from "@/lib/csv";
import { XLSX_CONTENT_TYPE, type SheetColumn, type SheetRow } from "@/lib/xlsx";

/**
 * An export is capped so a request cannot ask for the entire database. The
 * count is taken before anything is written: once the response starts flowing
 * the status is already sent and cannot be turned into a 413.
 */
export const EXPORT_ROW_LIMIT = 50_000;

/** Rows arrive a page at a time, so neither the caller nor this file holds them all. */
export type RowSource = () => AsyncIterable<SheetRow>;

interface ExportOptions {
  format: string | null;
  sheetName: string;
  baseFilename: string;
  columns: SheetColumn[];
  rows: RowSource;
}

function contentDisposition(baseFilename: string, extension: string): string {
  return `attachment; filename="${baseFilename}-${Date.now()}.${extension}"`;
}

/**
 * Rows per chunk. One row per enqueue was measurably slower than building the
 * whole file — thousands of stream pulls, each with its own encode — while a
 * chunk this size holds a negligible amount of memory and still hands control
 * back often enough that other requests are served throughout.
 */
const CSV_CHUNK_ROWS = 250;

function csvStream(columns: SheetColumn[], rows: RowSource): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = rows()[Symbol.asyncIterator]();
  let done = false;

  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(CSV_BOM + csvLine(columns.map((column) => column.header)))
      );
    },
    async pull(controller) {
      const lines: string[] = [];

      while (lines.length < CSV_CHUNK_ROWS) {
        const next = await iterator.next();
        if (next.done) {
          done = true;
          break;
        }
        lines.push(csvLine(columns.map((column) => next.value[column.key] ?? null)));
      }

      if (lines.length > 0) {
        controller.enqueue(encoder.encode(lines.join("")));
      }
      if (done) {
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

function xlsxStream(
  sheetName: string,
  columns: SheetColumn[],
  rows: RowSource
): ReadableStream<Uint8Array> {
  const output = new PassThrough();

  // The streaming writer commits each row as it goes rather than holding a
  // whole workbook in memory. Sheet-level settings have to be in place before
  // the first commit.
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true });

  // On the streaming writer `views` and `autoFilter` are read-only properties —
  // assigning them the way the in-memory Worksheet allows throws. They are
  // given as creation options instead.
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.max(12, column.header.length + 2),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  void (async () => {
    try {
      for await (const row of rows()) {
        sheet.addRow(row).commit();
        // A slow client used to mean the whole export -- up to 50,000 rows --
        // piling up in memory, because nothing here waited for the stream.
        if (output.writableNeedDrain) await once(output, "drain");
      }
      sheet.commit();
      await workbook.commit();
    } catch (error) {
      output.destroy(error as Error);
    }
  })();

  return Readable.toWeb(output) as ReadableStream<Uint8Array>;
}

export interface StreamedSheet {
  name: string;
  columns: SheetColumn[];
  rows: RowSource;
}

/**
 * Several sheets in one workbook, each streamed in turn: a sheet is filled
 * and committed before the next one starts, so the whole database can go out
 * without being held in memory. Styled like the single-sheet export.
 */
export function workbookStreamResponse({
  baseFilename,
  sheets,
}: {
  baseFilename: string;
  sheets: StreamedSheet[];
}): Response {
  const output = new PassThrough();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true });

  void (async () => {
    try {
      for (const { name, columns, rows } of sheets) {
        const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
        sheet.columns = columns.map((column) => ({
          header: column.header,
          key: column.key,
          width: column.width ?? Math.max(12, column.header.length + 2),
        }));
        sheet.getRow(1).font = { bold: true };
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
        for await (const row of rows()) {
          sheet.addRow(row).commit();
          if (output.writableNeedDrain) await once(output, "drain");
        }
        sheet.commit();
      }
      await workbook.commit();
    } catch (error) {
      output.destroy(error as Error);
    }
  })();

  return new Response(Readable.toWeb(output) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
    },
  });
}

/** Streams an export as CSV or a real .xlsx workbook from one column/row definition. */
export function exportResponse(options: ExportOptions): Response {
  if (options.format === "xlsx") {
    return new Response(xlsxStream(options.sheetName, options.columns, options.rows), {
      status: 200,
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": contentDisposition(options.baseFilename, "xlsx"),
      },
    });
  }

  return new Response(csvStream(options.columns, options.rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(options.baseFilename, "csv"),
    },
  });
}
