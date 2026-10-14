import ExcelJS from "exceljs";
import { REPORT_DOCUMENT, averagedRows, mean, type ReportRecord, type ReportSheet } from "@/modules/lab/lib/analytics/analysis-report";
import { placeImageInBox, pngSize, type ImageSize } from "@/core/lib/sheets/xlsx-brand";

/**
 * Writes the FORMULIR ANALYSIS RESULT workbook: the lab's own form, one sheet
 * per site.
 *
 * Rows 1-4 are the form's header -- the logo, the title, the document box
 * and "TABEL MC" -- and the bands over the columns ("JENIS SAMPLE" over the
 * stage dates, "LEAD TIME", "<SITE> PRODUCTION SAMPLE" over the elements).
 * Row 5 names each column; the samples start on row 6, batch by batch, each
 * batch of two or more closed by a blue row of averages.
 *
 * SM ratio, MC and the averages are written as formulas, with their values
 * cached, so the sheet keeps working when a figure in it is corrected.
 *
 * Not streamed: merged cells and the logo need the whole sheet. The export is
 * capped well below what that costs.
 */

/** Which part of the form a column belongs to; decides the band over it. */
export type ReportBand = "sample" | "stageAt" | "stageDetail" | "lead" | "results" | "instrument" | "mc" | "other";

export interface ReportColumn {
  key: string;
  /** Row 5. */
  header: string;
  band: ReportBand;
  /** Row 4, over a stage's column: "PREP BASAH". */
  stageName?: string;
  width?: number;
}

const HEADER_ROWS = 5;
/** Rows 1-4, the form's title block, are this tall each; the logo is fitted to them. */
const BANNER_ROW_HEIGHT_PT = 18;
const FIRST_DATA_ROW = HEADER_ROWS + 1;

const FONT = "Arial";
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const AVERAGE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB4C6E7" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };

/**
 * Every moment on the form -- a stage entered, the weighing -- with its time
 * on the lab's clock, not the day alone: two samples received the same day
 * hours apart read differently.
 */
const DATE_TIME = "d-mmm-yy hh:mm";

/** Three places where the form prints three, two elsewhere. */
const THREE_PLACES = new Set(["co", "cao"]);

function numberFormat(column: ReportColumn): string | undefined {
  if (column.band === "results") return THREE_PLACES.has(column.key) ? "0.000" : "0.00";
  if (column.band === "mc") return column.key === "mcDate" ? DATE_TIME : "0.0";
  if (column.key === "leadTime") return "0.0";
  return undefined;
}

/** 1 -> A, 27 -> AA. */
function letter(index: number): string {
  let name = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Row numbers as the fewest ranges: [7,8,9,11] -> "F7:F9,F11". */
function cellList(column: string, rows: readonly number[]): string {
  const parts: string[] = [];
  let start = rows[0];
  for (let index = 1; index <= rows.length; index++) {
    const previous = rows[index - 1];
    if (rows[index] === previous + 1) continue;
    parts.push(start === previous ? `${column}${start}` : `${column}${start}:${column}${previous}`);
    start = rows[index];
  }
  return parts.join(",");
}

interface Run {
  band: ReportBand;
  start: number;
  end: number;
}

/** Consecutive columns of one band. */
function runsOf(columns: readonly ReportColumn[]): Run[] {
  const runs: Run[] = [];
  columns.forEach((column, index) => {
    const last = runs[runs.length - 1];
    if (last && last.band === column.band) last.end = index + 1;
    else runs.push({ band: column.band, start: index + 1, end: index + 1 });
  });
  return runs;
}

function merge(sheet: ExcelJS.Worksheet, top: number, left: number, bottom: number, right: number) {
  if (top === bottom && left === right) return;
  sheet.mergeCells(top, left, bottom, right);
}

function writeSheet(
  workbook: ExcelJS.Workbook,
  report: ReportSheet,
  columns: readonly ReportColumn[],
  logo: { id: number; size: ImageSize } | null
) {
  const total = columns.length;
  const leading = columns.findIndex((column) => column.band !== "sample");
  const logoEnd = leading === -1 ? total : leading;

  const sheet = workbook.addWorksheet(report.name, {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", xSplit: logoEnd, ySplit: HEADER_ROWS }],
  });
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width ?? 10 }));

  const runs = runsOf(columns);
  const instrument = runs.find((run) => run.band === "instrument");
  // The document box needs a label column and a value column.
  const docBox = instrument && instrument.end > instrument.start ? instrument : null;
  const mcBox = runs.find((run) => run.band === "mc") ?? null;
  const boxed = (index: number) =>
    (docBox !== null && index >= docBox.start && index <= docBox.end) ||
    (mcBox !== null && index >= mcBox.start && index <= mcBox.end);

  // --- The form's header, rows 1-4 ---
  if (logoEnd > 0) {
    merge(sheet, 1, 1, 4, logoEnd);
    const cell = sheet.getCell(1, 1);
    if (logo === null) {
      cell.value = "ASPIRE\nstargate";
      cell.font = { name: FONT, size: 12, bold: true, color: { argb: "FF1F3864" } };
    }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    if (logo !== null) {
      // Fitted at its own proportions, not stretched over A1:..4.
      placeImageInBox(sheet, logo.id, {
        size: logo.size,
        columnWidths: columns.slice(0, logoEnd).map((column) => column.width ?? 10),
        rowHeightsPt: [1, 2, 3, 4].map(() => BANNER_ROW_HEIGHT_PT),
      });
    }
  }

  const titleStart = logoEnd + 1;
  const firstBox = [docBox?.start, mcBox?.start].filter((start): start is number => start !== undefined && start >= titleStart);
  const titleEnd = (firstBox.length > 0 ? Math.min(...firstBox) : total + 1) - 1;
  if (titleEnd >= titleStart) {
    merge(sheet, 1, titleStart, 2, titleEnd);
    const title = sheet.getCell(1, titleStart);
    title.value = "FORMULIR ANALYSIS RESULT";
    title.font = { name: FONT, size: 14, bold: true };
    title.alignment = { horizontal: "center", vertical: "middle" };
  }

  if (docBox) {
    const lines: [string, string][] = [
      ["No. Dokumen", REPORT_DOCUMENT.number],
      ["No. Revisi", REPORT_DOCUMENT.revision],
      ["Tanggal Berlaku Dok.", REPORT_DOCUMENT.effective],
      ["Dilaporkan Oleh", REPORT_DOCUMENT.reportedBy],
    ];
    lines.forEach(([label, value], index) => {
      const row = index + 1;
      sheet.getCell(row, docBox.start).value = label;
      merge(sheet, row, docBox.start + 1, row, docBox.end);
      sheet.getCell(row, docBox.start + 1).value = value;
      for (let col = docBox.start; col <= docBox.end; col++) {
        sheet.getCell(row, col).font = { name: FONT, size: 8 };
        sheet.getCell(row, col).alignment = { vertical: "middle", wrapText: true };
      }
    });
  }

  if (mcBox) {
    merge(sheet, 1, mcBox.start, 4, mcBox.end);
    const cell = sheet.getCell(1, mcBox.start);
    cell.value = "TABEL MC";
    cell.font = { name: FONT, size: 14 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  }

  // --- The bands over the columns, rows 3-4 ---
  for (const run of runs) {
    if (run.start <= logoEnd || boxed(run.start)) continue;
    const band = (text: string | null, rows: "both" | "top") => {
      merge(sheet, 3, run.start, rows === "both" ? 4 : 3, run.end);
      const cell = sheet.getCell(3, run.start);
      cell.value = text;
      cell.font = { name: FONT, size: 9, bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    };
    if (run.band === "stageAt" || run.band === "stageDetail") {
      band(run.band === "stageAt" ? "JENIS SAMPLE" : "DETAIL TAHAP", "top");
      for (let col = run.start; col <= run.end; col++) {
        const cell = sheet.getCell(4, col);
        cell.value = (columns[col - 1].stageName ?? "").toUpperCase();
        cell.font = { name: FONT, size: 8, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      }
    } else if (run.band === "lead") {
      band("LEAD TIME", "both");
    } else if (run.band === "results") {
      band(report.title, "both");
    } else {
      band(null, "both");
    }
  }

  // --- Row 5: each column's name ---
  columns.forEach((column, index) => {
    const cell = sheet.getCell(HEADER_ROWS, index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, size: 9, bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // --- The samples ---
  const at = new Map(columns.map((column, index) => [column.key, index + 1]));
  const ref = (key: string, row: number) => `${letter(at.get(key)!)}${row}`;
  const has = (...keys: string[]) => keys.every((key) => at.has(key));

  let row = FIRST_DATA_ROW;
  let number = 0;
  for (const batch of report.batches) {
    const averaged = new Set(averagedRows(batch).map((record) => record.id));
    const averagedAt: number[] = [];

    for (const record of batch) {
      const isSub = !averaged.has(record.id);
      if (!isSub) {
        number += 1;
        averagedAt.push(row);
      }
      writeRecord(sheet, columns, record, row, isSub ? null : number, { ref, has });
      row += 1;
    }

    // Every batch closes with its average, a batch of one included: without
    // that row two batches run together and read as a single group.
    if (averagedAt.length >= 1) {
      const members = batch.filter((record) => averaged.has(record.id));
      columns.forEach((column, index) => {
        const cell = sheet.getCell(row, index + 1);
        cell.fill = AVERAGE_FILL;
        cell.font = { name: FONT, size: 9, bold: true };
        if (column.band !== "results") return;
        const value = mean(members.map((member) => member.cells[column.key]));
        if (value === null) return;
        cell.value = { formula: `IFERROR(AVERAGE(${cellList(letter(index + 1), averagedAt)}),"")`, result: value };
        cell.numFmt = "0.00";
        cell.alignment = { horizontal: "right" };
      });
      row += 1;
    }
  }

  // Borders and the header's font, over the whole form.
  const lastRow = Math.max(row - 1, HEADER_ROWS);
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= total; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = THIN;
      if (!cell.font) cell.font = { name: FONT, size: 9 };
    }
  }
  for (let r = 1; r <= 4; r++) sheet.getRow(r).height = BANNER_ROW_HEIGHT_PT;
  sheet.getRow(HEADER_ROWS).height = 30;
}

function writeRecord(
  sheet: ExcelJS.Worksheet,
  columns: readonly ReportColumn[],
  record: ReportRecord,
  row: number,
  number: number | null,
  { ref, has }: { ref: (key: string, row: number) => string; has: (...keys: string[]) => boolean }
) {
  columns.forEach((column, index) => {
    const cell = sheet.getCell(row, index + 1);
    cell.font = { name: FONT, size: 9 };
    const value = column.key === "rowNo" ? number : record.cells[column.key] ?? null;

    if (column.key === "smRatio" && typeof value === "number" && has("sio2", "mgo")) {
      cell.value = { formula: `IFERROR(${ref("sio2", row)}/${ref("mgo", row)},"")`, result: value };
    } else if (column.key === "mc" && typeof value === "number" && has("wp", "w0", "wd")) {
      const [wp, w0, wd] = [ref("wp", row), ref("w0", row), ref("wd", row)];
      cell.value = { formula: `IFERROR((${w0}-${wd})*100/(${w0}-${wp}),"")`, result: value };
    } else {
      cell.value = value;
    }

    const format = value instanceof Date ? DATE_TIME : numberFormat(column);
    if (format) cell.numFmt = format;
    cell.alignment =
      column.key === "rowNo" || value instanceof Date || column.band === "lead"
        ? { horizontal: "center" }
        : typeof value === "number"
          ? { horizontal: "right" }
          : { horizontal: "left" };
  });
}

export async function buildAnalysisReport({
  sheets,
  columns,
  logo,
}: {
  sheets: readonly ReportSheet[];
  columns: readonly ReportColumn[];
  /** A PNG for the header's corner; the name in words without one. */
  logo?: Uint8Array | null;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Atara";
  const image = logo
    ? {
        id: workbook.addImage({ buffer: Buffer.from(logo) as unknown as ExcelJS.Buffer, extension: "png" }),
        size: pngSize(logo),
      }
    : null;

  // An empty export is still the form, with nothing on it.
  const written: readonly ReportSheet[] =
    sheets.length > 0
      ? sheets
      : [{ site: "", siteCode: "", nonProd: null, name: "Formulir", title: "PRODUCTION SAMPLE", batches: [] }];
  for (const report of written) writeSheet(workbook, report, columns, image);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
