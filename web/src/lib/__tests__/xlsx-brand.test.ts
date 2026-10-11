import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportResponse } from "@/lib/export-response";
import { BRANDED_HEADER_ROW, placeImageInBox, pngSize, readBrandLogo } from "@/lib/xlsx-brand";
import { xlsxExportGate } from "@/lib/heavy-gate";
import type { SheetRow } from "@/lib/xlsx";

const COLUMNS = [
  { header: "Sample code", key: "code" },
  { header: "Stage", key: "stage" },
];

function rowsOf(list: SheetRow[]) {
  return async function* () {
    yield* list;
  };
}

async function load(response: Response): Promise<ExcelJS.Worksheet> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  return book.worksheets[0];
}

describe("branded xlsx exports", () => {
  it("finds the logo in public/ and reads its size from the PNG", async () => {
    const logo = await readBrandLogo();
    expect(logo).not.toBeNull();
    expect(pngSize(logo!)).toEqual({ width: 320, height: 314 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toEqual({ width: 1, height: 1 });
  });

  it("fits an image to a wide box by its height, centred across it", () => {
    const sheet = new ExcelJS.Workbook().addWorksheet("x");
    // Two columns of 10 characters (75px each) by one 30pt row (40px).
    const placed = placeImageInBox(sheet, 0, {
      size: { width: 100, height: 100 },
      columnWidths: [10, 10],
      rowHeightsPt: [30],
      padding: 0,
    });
    expect(placed).toEqual({ width: 40, height: 40, left: 55, top: 0 });
    const [image] = sheet.getImages();
    // 55px into column A, in EMUs (9525 a pixel) -- not ExcelJS's own scale.
    expect(image.range.tl).toMatchObject({ nativeCol: 0, nativeColOff: 55 * 9525, nativeRow: 0, nativeRowOff: 0 });
    expect((image.range as typeof image.range & { ext?: unknown }).ext).toEqual({ width: 40, height: 40 });
  });

  it("puts the logo and title above the table", async () => {
    const sheet = await load(
      exportResponse({
        format: "xlsx",
        sheetName: "Nickel Samples",
        baseFilename: "samples",
        columns: COLUMNS,
        rows: rowsOf([
          { code: "A-001", stage: "Prep" },
          { code: "A-002", stage: "Assay" },
        ]),
      })
    );

    expect(sheet.getImages()).toHaveLength(1);
    expect(sheet.getRow(1).values).toContain("Nickel Samples");
    expect(sheet.getRow(BRANDED_HEADER_ROW).values).toEqual([undefined, "Sample code", "Stage"]);
    expect(sheet.getRow(BRANDED_HEADER_ROW + 1).values).toEqual([undefined, "A-001", "Prep"]);
    expect(sheet.getRow(BRANDED_HEADER_ROW + 2).values).toEqual([undefined, "A-002", "Assay"]);
    // Read back from the file as a range.
    expect(sheet.autoFilter).toBe(`A${BRANDED_HEADER_ROW}:B${BRANDED_HEADER_ROW}`);
  });

  it("keeps a plain sheet plain, headers on row 1, for the importer", async () => {
    const sheet = await load(
      exportResponse({
        format: "xlsx",
        sheetName: "Results",
        baseFilename: "template",
        columns: COLUMNS,
        rows: rowsOf([]),
        plain: true,
      })
    );

    expect(sheet.getImages()).toHaveLength(0);
    expect(sheet.getRow(1).values).toEqual([undefined, "Sample code", "Stage"]);
  });

  it("gives its gate slot back once the file is sent", async () => {
    const response = exportResponse({
      format: "xlsx",
      sheetName: "Stage Activity",
      baseFilename: "activity",
      columns: COLUMNS,
      rows: rowsOf([{ code: "A-001", stage: "Prep" }]),
    });
    expect(xlsxExportGate.inUse).toBe(1);
    await response.arrayBuffer();
    expect(xlsxExportGate.inUse).toBe(0);
  });

  it("turns a third concurrent export away with a 429 rather than building it", async () => {
    const slow = () =>
      exportResponse({
        format: "xlsx",
        sheetName: "Busy",
        baseFilename: "busy",
        columns: COLUMNS,
        rows: async function* () {
          await new Promise((resolve) => setTimeout(resolve, 50));
        },
      });
    const first = slow();
    const second = slow();
    expect(() => slow()).toThrow(expect.objectContaining({ status: 429 }));
    await Promise.all([first.arrayBuffer(), second.arrayBuffer()]);
    expect(xlsxExportGate.inUse).toBe(0);
  });
});
