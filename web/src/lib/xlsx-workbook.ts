import ExcelJS from "exceljs";
import { XLSX_CONTENT_TYPE, type SheetColumn, type SheetRow } from "@/lib/xlsx";

export interface WorkbookSheet {
  name: string;
  columns: SheetColumn[];
  rows: SheetRow[];
}

/**
 * A small workbook of several sheets, built in memory.
 *
 * export-response.ts streams one sheet because an export can run to 50,000
 * rows. A summary is a few hundred rows at most, spread over several sheets,
 * which the streaming writer does not make easy; holding it whole is fine.
 * Styled the same way: bold, frozen header row with a filter on it.
 */
export async function buildWorkbook(sheets: WorkbookSheet[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();

  for (const { name, columns, rows } of sheets) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? Math.max(12, column.header.length + 2),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    for (const row of rows) sheet.addRow(row);
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function workbookResponse(
  baseFilename: string,
  sheets: WorkbookSheet[]
): Promise<Response> {
  return new Response(await buildWorkbook(sheets), {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
    },
  });
}
