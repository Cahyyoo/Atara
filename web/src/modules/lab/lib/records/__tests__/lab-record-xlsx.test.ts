import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readWorkbookAsText } from "@/core/lib/sheets/xlsx-read";
import { readImportSheet } from "@/modules/lab/lib/records/lab-record-import";
import { parseSheetDateTime } from "@/modules/lab/lib/records/measurement-time";

/**
 * A workbook uploaded to the results import: core flattens it to the same
 * tab-separated text a paste is (core/lib/sheets/xlsx-read.ts), and the lab's
 * importer must then read it exactly as it reads a paste.
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

describe("a date cell from a workbook", () => {
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
