import { describe, expect, it } from "vitest";
import { readImportCell, readImportSheet } from "@/lib/lab-record-import";

/**
 * A block copied out of Excel is tab-separated and, in an Indonesian locale,
 * writes "1,86" for 1.86. The import used to read only commas and Number(),
 * so a pasted sheet split into the wrong columns and every result came back
 * "not valid".
 */

describe("reading a sheet", () => {
  it("reads a block pasted from Excel: tabs, comma decimals, a trailing newline", () => {
    const pasted = "Lab Code\tNi\tFe\nSPR.001\t1,86\t42,25\nSPR.002\t1,12\t40\n";
    const read = readImportSheet(pasted);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    // Matched on the Sample ID; the column headed Lab Code is read as one.
    expect(read.sheet.keyColumn).toBe("sampleIdent");
    expect(read.sheet.keyIndex).toBe(0);
    expect(read.sheet.fields.map((field) => field.key)).toEqual(["ni", "fe"]);
    expect(read.sheet.rows.map((row) => row.cells[1])).toEqual(["1,86", "1,12"]);
    expect(readImportCell("ni", "1,86")).toEqual({ value: 1.86 });
  });

  it("still reads a saved CSV with commas between the columns", () => {
    const read = readImportSheet("Lab Code,Ni\nSPR.001,1.86\n");
    expect(read.ok && read.sheet.rows[0].cells).toEqual(["SPR.001", "1.86"]);
  });

  it("drops blank rows a dragged selection brings along, keeping line numbers true", () => {
    const read = readImportSheet("Lab Code\tNi\n\t\nSPR.001\t1\n\t\n\n");
    expect(read.ok && read.sheet.rows).toEqual([{ line: 3, cells: ["SPR.001", "1"] }]);
  });

  it("matches on Sample ID when there is no Lab Code column", () => {
    const read = readImportSheet("Sample ID\tNi\nMOL/8100\t1\n");
    expect(read.ok && read.sheet.keyColumn).toBe("sampleIdent");
  });

  it("says why a sheet cannot be read", () => {
    expect(readImportSheet("")).toEqual({ ok: false, error: "empty" });
    expect(readImportSheet("Lab Code\tNi\n")).toEqual({ ok: false, error: "empty" });
    // Copied without the header row: nothing says which column is which.
    expect(readImportSheet("SPR.001\t1,86\nSPR.002\t1,12\n")).toEqual({ ok: false, error: "noKey" });
    expect(readImportSheet("Lab Code\tColour\nSPR.001\tred\n")).toEqual({ ok: false, error: "noFields" });
  });
});

describe("reading a cell", () => {
  it("takes thousands separators and spaces the way a sheet writes them", () => {
    // Whichever mark comes last is the decimal one.
    expect(readImportCell("sum", "1.000,5")).toEqual({ value: 1000.5 });
    expect(readImportCell("sum", "1,000.5")).toEqual({ value: 1000.5 });
    expect(readImportCell("ni", " 2 ")).toEqual({ value: 2 });
  });

  it("names what it could not read, instead of storing NaN", () => {
    expect(readImportCell("ni", "n/a")).toEqual({ error: 'ni: "n/a" is not a number.' });
  });

  it("treats an empty cell as no result, and text columns as written", () => {
    expect(readImportCell("ni", "")).toEqual({ value: null });
    expect(readImportCell("remarks", "re-run")).toEqual({ value: "re-run" });
  });
});
