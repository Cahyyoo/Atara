import { describe, expect, it } from "vitest";
import { isBlock, rangeToTsv, readClipboardBlock, spreadPaste } from "@/modules/lab/lib/records/sheet-paste";

/**
 * The clipboard between Excel and the result grids: a copied block lands in
 * the boxes as it would in another sheet, and boxes copied out land in Excel
 * as the same block.
 */

const VISIBLE = ["ni", "fe", "co", "sio2"];
const KNOWN = [...VISIBLE, "mgo", "measurementFinished", "remarks", "sampleIdent"];
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

describe("a block pasted into the grid", () => {
  it("is laid down from the box it was pasted in, across the columns on screen", () => {
    const result = spreadPaste("1.86\t42.2\n1.90\t41.0", { visible: VISIBLE, known: KNOWN, start: { row: 2, col: 1 } });
    expect(at(result.writes)).toEqual({ "2:fe": "1.86", "2:co": "42.2", "3:fe": "1.90", "3:co": "41.0" });
    expect(result.rowsNeeded).toBe(4);
  });

  it("is matched by name when it brings its header, whatever the sheet's order", () => {
    const result = spreadPaste("Fe\tSample ID\tNi\tMgO\n42.2\tNKL-1\t1,86\t20", {
      visible: VISIBLE,
      known: KNOWN,
      start: { row: 0, col: 3 },
    });
    expect(at(result.writes)).toEqual({ "0:fe": "42.2", "0:sampleIdent": "NKL-1", "0:ni": "1,86", "0:mgo": "20" });
    // MgO was not on screen, and must be shown before it is saved unseen.
    expect(result.hiddenFilled.sort()).toEqual(["mgo", "sampleIdent"]);
  });

  it("leaves a box alone where the block has a gap", () => {
    const result = spreadPaste("1.86\t\t3.1", { visible: VISIBLE, known: KNOWN, start: { row: 0, col: 0 } });
    expect(at(result.writes)).toEqual({ "0:ni": "1.86", "0:co": "3.1" });
  });

  it("drops what falls off the right edge, and counts what falls off the bottom", () => {
    const result = spreadPaste("1\t2\t3\n4\t5\t6\n7\t8\t9", {
      visible: VISIBLE,
      known: KNOWN,
      start: { row: 1, col: 2 },
      rowCount: 2,
    });
    expect(at(result.writes)).toEqual({ "1:co": "1", "1:sio2": "2" });
    expect(result.extraRows).toBe(2);
  });

  it("reads the sheet's date into what a date-time box holds", () => {
    const result = spreadPaste("Measurement Finished\tNi\n2026-03-16 10:34\t1.2", {
      visible: VISIBLE,
      known: KNOWN,
      start: { row: 0, col: 0 },
    });
    expect(at(result.writes)["0:measurementFinished"]).toBe("2026-03-16T10:34");
  });

  it("reads a block straight out of the instrument's export by the export's order", () => {
    // No header, and it opens with the time measured: pasted into Ni, the date
    // must not land in the Ni box.
    const result = spreadPaste("2026-03-16 10:34	1.86	42.2", {
      visible: VISIBLE,
      known: KNOWN,
      start: { row: 0, col: 0 },
    });
    expect(at(result.writes)).toEqual({ "0:measurementFinished": "2026-03-16T10:34", "0:ni": "1.86", "0:fe": "42.2" });
    expect(result.hiddenFilled).toEqual(["measurementFinished"]);
  });

  it("keeps a date as the sheet wrote it, for a grid whose date box is text", () => {
    const result = spreadPaste("9/1/2026 8:54	1.86", {
      visible: ["measurementFinished", "ni"],
      known: KNOWN,
      start: { row: 0, col: 0 },
      rawDates: true,
    });
    expect(at(result.writes)).toEqual({ "0:measurementFinished": "9/1/2026 8:54", "0:ni": "1.86" });
  });

  it("fills a selected rectangle with one copied value", () => {
    const result = spreadPaste("0.5", {
      visible: VISIBLE,
      known: KNOWN,
      start: { row: 0, col: 0 },
      range: { top: 0, left: 1, bottom: 2, right: 2 },
    });
    expect(result.writes).toHaveLength(6);
    expect(new Set(result.writes.map((write) => write.value))).toEqual(new Set(["0.5"]));
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
