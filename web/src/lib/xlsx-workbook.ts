import ExcelJS from "exceljs";
import { XLSX_CONTENT_TYPE, type SheetColumn, type SheetRow } from "@/lib/xlsx";
import { readBrandLogo, writeBrandedHeader } from "@/lib/xlsx-brand";

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
 * Each sheet opens with the logo and its name, then the bold, frozen,
 * filtered header row (see writeBrandedHeader).
 */
export async function buildWorkbook(sheets: WorkbookSheet[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const logo = await readBrandLogo();

  for (const { name, columns, rows } of sheets) {
    const sheet = workbook.addWorksheet(name);
    writeBrandedHeader(workbook, sheet, { title: name, columns, logo });
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
