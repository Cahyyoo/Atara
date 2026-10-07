import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "@/lib/xlsx-workbook";

describe("buildWorkbook", () => {
  it("writes one sheet per section, each with its header row and rows", async () => {
    const buffer = await buildWorkbook([
      {
        name: "Summary",
        columns: [
          { header: "Item", key: "item" },
          { header: "Value", key: "value" },
        ],
        rows: [{ item: "Samples", value: 12 }],
      },
      {
        name: "Daily throughput",
        columns: [
          { header: "Shift date", key: "shiftDate" },
          { header: "Created", key: "created" },
        ],
        rows: [
          { shiftDate: "2026-09-30", created: 4 },
          { shiftDate: "2026-10-01", created: 8 },
        ],
      },
    ]);

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);

    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(["Summary", "Daily throughput"]);
    const daily = book.getWorksheet("Daily throughput")!;
    expect(daily.getRow(1).values).toEqual([undefined, "Shift date", "Created"]);
    expect(daily.getRow(3).values).toEqual([undefined, "2026-10-01", 8]);
    expect(daily.getRow(1).font?.bold).toBe(true);
  });
});
