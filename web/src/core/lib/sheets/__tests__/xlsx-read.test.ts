import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readWorkbookAsText } from "@/core/lib/sheets/xlsx-read";

/**
 * Reading a workbook the same way a pasted block is read.
 *
 * The sheet is flattened to tab-separated text and handed to the importer that
 * already exists, so a workbook and a paste differ in how they arrive and in
 * nothing else. Most of what is below is about the one cell type where that
 * flattening can go quietly wrong.
 */

async function workbook(rows: (string | number | Date | null)[][]): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Results");
  for (const row of rows) sheet.addRow(row);
  return (await book.xlsx.writeBuffer()) as ArrayBuffer;
}

/** The wall clock a sheet shows, which carries no zone with it. */
const wallClock = (y: number, m: number, d: number, hh: number, mm: number) =>
  new Date(Date.UTC(y, m - 1, d, hh, mm));

describe("a date cell", () => {
  /**
   * Measured, not reasoned about. A cell showing "3/16/2026 10:34" comes back
   * from exceljs as a Date whose UTC parts are that wall clock. Both obvious
   * readings are wrong by the same eight hours on a UTC+8 machine:
   * String(date) says 18:34, and converting the instant into the lab's zone
   * says 18:34 too -- that one treats a wall clock as though it were already
   * an instant somewhere else.
   */
  it("keeps the time the sheet shows", async () => {
    const read = await readWorkbookAsText(
      await workbook([["Measurement Finished"], [wallClock(2026, 3, 16, 10, 34)]])
    );

    expect(read.ok).toBe(true);
    if (read.ok) expect(read.text.split("\n")[1].trim()).toBe("2026-03-16 10:34");
  });
});

describe("the rest of a sheet", () => {
  it("holds its columns in place when a cell is empty", async () => {
    // Iterating only the filled cells would shuffle every later value one
    // column to the left, which lands a result under the wrong element.
    const read = await readWorkbookAsText(await workbook([["Lab Code", "Ni", "Fe"], ["L1", null, 42.25]]));

    expect(read.ok).toBe(true);
    if (read.ok) expect(read.text.split("\n")[1]).toBe("L1\t\t42.25");
  });

  it("is tab separated, so a value with a comma needs no quoting", async () => {
    const read = await readWorkbookAsText(await workbook([["Remarks"], ["wet, re-run"]]));

    expect(read.ok).toBe(true);
    if (read.ok) expect(read.text.split("\n")[1].trim()).toBe("wet, re-run");
  });

  it("flattens a tab inside a cell rather than inventing a column", async () => {
    const read = await readWorkbookAsText(await workbook([["Remarks"], ["a\tb"]]));

    expect(read.ok).toBe(true);
    if (read.ok) expect(read.text.split("\n")[1].split("\t")).toHaveLength(1);
  });

  it("says so when the file is not a workbook at all", async () => {
    // A CSV renamed .xlsx, a truncated download, a .xls from 2003.
    const read = await readWorkbookAsText(new TextEncoder().encode("Lab Code,Ni\nL1,1.86").buffer);

    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error).toBe("unreadable");
  });
});
