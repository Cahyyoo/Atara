import { describe, expect, it } from "vitest";
import { isBlock, rangeToTsv, readClipboardBlock, spreadBlock } from "@/core/lib/sheets/clipboard-block";

/**
 * The clipboard between Excel and a grid of boxes: a copied block lands in the
 * boxes as it would in another sheet, and boxes copied out land in Excel as
 * the same block.
 */

const at = (writes: { row: number; key: string; value: string }[]) =>
  Object.fromEntries(writes.map((write) => [`${write.row}:${write.key}`, write.value]));

describe("reading what Excel put on the clipboard", () => {
  it("is rows of tab-separated cells, its trailing newline dropped", () => {
    expect(readClipboardBlock("1.86\t42.2\r\n1.90\t41.0\r\n")).toEqual([
      ["1.86", "42.2"],
      ["1.90", "41.0"],
    ]);
  });

  it("keeps an empty row inside the block, so the rows below stay in line", () => {
    expect(readClipboardBlock("1\n\n3\n")).toEqual([["1"], [""], ["3"]]);
  });

  it("tells a block from text for one box", () => {
    expect(isBlock("1.86")).toBe(false);
    expect(isBlock("1.86\n")).toBe(false);
    expect(isBlock("1.86\t42")).toBe(true);
    expect(isBlock("1.86\n1.90")).toBe(true);
  });
});

describe("boxes copied out of the grid", () => {
  const rows = [
    { ni: "1.86", fe: "42.2", remarks: 'said "ok"', measurementFinished: "2026-03-16T10:34" },
    { ni: "", fe: "41", remarks: "", measurementFinished: "" },
  ] as Record<string, string>[];

  it("land in Excel as the same rows and columns", () => {
    expect(rangeToTsv({ top: 0, left: 0, bottom: 1, right: 1 }, ["ni", "fe"], (row, key) => rows[row][key])).toBe(
      "1.86\t42.2\n\t41"
    );
  });

  it("quote a cell only when Excel would need it, and write a date as a sheet shows it", () => {
    expect(
      rangeToTsv({ top: 0, left: 0, bottom: 0, right: 1 }, ["remarks", "measurementFinished"], (row, key) => rows[row][key])
    ).toBe('"said ""ok"""\t2026-03-16 10:34');
  });
});

describe("a block spread across a growing grid", () => {
  const COLUMNS = ["holeId", "area", "status", "totalDepth"];
  const HEADERS: Record<string, string> = { "hole id": "holeId", area: "area", status: "status", depth: "totalDepth", selesai: "endDate" };
  const keyForHeader = (header: string) => HEADERS[header.trim().toLowerCase()] ?? null;

  it("lays a block without a header down from the box it was pasted into", () => {
    const result = spreadBlock("A\tBlok\nB\tBlok 2", { columns: COLUMNS, start: { row: 3, col: 0 }, keyForHeader });
    expect(at(result.writes)).toEqual({ "3:holeId": "A", "3:area": "Blok", "4:holeId": "B", "4:area": "Blok 2" });
    expect(result.rowsNeeded).toBe(5);
  });

  it("matches a header by name, in any order, and leaves blank cells alone", () => {
    const result = spreadBlock("Depth\tHole ID\n120\tDH-1\n\tDH-2", { columns: COLUMNS, start: { row: 0, col: 2 }, keyForHeader });
    expect(at(result.writes)).toEqual({ "0:totalDepth": "120", "0:holeId": "DH-1", "1:holeId": "DH-2" });
  });

  // "Selesai" is a status and the end date's heading: one such word does not make a header.
  it("does not take a data row holding one heading-like word for a header", () => {
    const result = spreadBlock("DH-1\tBlok A\tSelesai\t50", { columns: COLUMNS, start: { row: 0, col: 0 }, keyForHeader });
    expect(at(result.writes)).toEqual({ "0:holeId": "DH-1", "0:area": "Blok A", "0:status": "Selesai", "0:totalDepth": "50" });
  });

  it("fills a selected rectangle with one copied value", () => {
    const result = spreadBlock("PLANNED", {
      columns: COLUMNS,
      start: { row: 0, col: 2 },
      range: { top: 0, left: 2, bottom: 1, right: 2 },
    });
    expect(at(result.writes)).toEqual({ "0:status": "PLANNED", "1:status": "PLANNED" });
  });
});
