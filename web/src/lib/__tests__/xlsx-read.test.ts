import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readWorkbookAsText } from "@/lib/xlsx-read";
import { readImportSheet } from "@/lib/lab-record-import";
import { parseSheetDateTime } from "@/lib/paste-map";

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

  it("comes out in a form the sheet readers already parse", async () => {
    // The whole point of the flattening: what comes out has to be what the
    // pasted-text path puts in.
    const read = await readWorkbookAsText(
      await workbook([["Measurement Finished"], [wallClock(2026, 3, 16, 10, 34)]])
    );
    if (!read.ok) throw new Error("expected a readable workbook");

    const parsed = parseSheetDateTime(read.text.split("\n")[1].trim());
    expect(parsed).not.toBeNull();
    // 10:34 on the lab's clock is 02:34 UTC. Eight hours out either way is
    // exactly the failure this file exists to stop.
    expect(parsed?.toISOString()).toBe("2026-03-16T02:34:00.000Z");
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

describe("a workbook reaching the importer", () => {
  it("is understood exactly as the same sheet pasted as text would be", async () => {
    const read = await readWorkbookAsText(
      await workbook([
        ["Lab Code", "Ni (%)", "Fe (%)", "Measurement Finished"],
        ["SPR.QLAB.20260921.001", 1.86, 42.25, wallClock(2026, 3, 16, 10, 34)],
      ])
    );
    if (!read.ok) throw new Error("expected a readable workbook");

    const sheet = readImportSheet(read.text);
    expect(sheet.ok).toBe(true);
    if (!sheet.ok) return;

    expect(sheet.sheet.keyColumn).toBe("sampleIdent");
    expect(sheet.sheet.rows).toHaveLength(1);
    // Every parenthesised unit stripped, the timestamp kept as a value.
    expect(sheet.sheet.fields.map((field) => field.key)).toEqual([
      "ni",
      "fe",
      "measurementFinished",
    ]);
  });

  it("is refused without a key column, the same as a paste would be", async () => {
    /**
     * The instrument's own export has no Lab Code and no Sample ID, so
     * nothing in it says which sample a row belongs to. The import screen
     * ticks nothing, so there is nothing to match against either -- and
     * guessing would write results onto the wrong sample, which is the worst
     * thing this application can do. Pinned here so the limit is a decision
     * rather than a surprise.
     */
    const read = await readWorkbookAsText(
      await workbook([
        ["Measurement Finished", "Ni (%)", "Fe (%)"],
        [wallClock(2026, 3, 16, 10, 34), 1.86, 42.25],
      ])
    );
    if (!read.ok) throw new Error("expected a readable workbook");

    const sheet = readImportSheet(read.text);
    expect(sheet.ok).toBe(false);
    if (!sheet.ok) expect(sheet.error).toBe("noKey");
  });
});
