import { describe, expect, it } from "vitest";
import {
  asLoaded,
  emptyWrites,
  fillWrites,
  hasAssay,
  lockCounts,
  type SheetRow,
} from "@/modules/eksplorasi/components/sheet/sheet-rows";

/** Which loaded samples the sheet locks, without a browser. */

describe("a sample's assay results", () => {
  it("are there with any one element written, even one that is not a number", () => {
    expect(hasAssay({ sampleId: "S-1", campaign: "C1" })).toBe(false);
    expect(hasAssay({ sampleId: "S-1", ni: "  " })).toBe(false);
    expect(hasAssay({ sampleId: "S-1", mc: "<0.01" })).toBe(true);
  });
});

describe("a loaded sample put back", () => {
  it("takes its loaded cells again, locked only when it has assay results", () => {
    const assayed: SheetRow = { id: "a", locked: false, original: { sampleId: "A", ni: "1.2" }, cells: { sampleId: "A", ni: "9" } };
    const bare: SheetRow = { id: "b", locked: true, original: { sampleId: "B" }, cells: { sampleId: "B", ni: "1.1" } };
    expect(asLoaded(assayed)).toMatchObject({ locked: true, cells: { sampleId: "A", ni: "1.2" } });
    expect(asLoaded(bare)).toMatchObject({ locked: false, cells: { sampleId: "B" } });
  });
});

describe("the sheet's loaded samples", () => {
  it("are counted locked or open, leaving the new rows out", () => {
    const rows: SheetRow[] = [
      { id: "a", locked: true, cells: {} },
      { id: "b", locked: false, cells: {} },
      { id: "c", locked: true, cells: {} },
      { locked: false, cells: { sampleId: "NEW" } },
    ];
    expect(lockCounts(rows)).toEqual({ lockedCount: 2, openCount: 1 });
  });
});

describe("the fill handle's copy", () => {
  const rows: SheetRow[] = [
    { locked: false, cells: { campaign: "C1", ni: "1.1" } },
    { locked: false, cells: { campaign: "C2", ni: "2.2" } },
  ];
  const keys = ["campaign", "ni"];

  it("repeats the source rows down the target, in turn, as written", () => {
    const writes = fillWrites(rows, keys, { top: 0, left: 1, bottom: 1, right: 1 }, { top: 2, left: 1, bottom: 5, right: 1 });
    expect(writes).toEqual([
      { row: 2, key: "ni", value: "1.1" },
      { row: 3, key: "ni", value: "2.2" },
      { row: 4, key: "ni", value: "1.1" },
      { row: 5, key: "ni", value: "2.2" },
    ]);
  });

  it("copies every column of the source, an empty box as empty", () => {
    const writes = fillWrites([{ locked: false, cells: { campaign: "C1" } }], keys, { top: 0, left: 0, bottom: 0, right: 1 }, { top: 1, left: 0, bottom: 1, right: 1 });
    expect(writes).toEqual([
      { row: 1, key: "campaign", value: "C1" },
      { row: 1, key: "ni", value: "" },
    ]);
  });
});

describe("the boxes Delete empties", () => {
  it("are every box of the range", () => {
    expect(emptyWrites(["campaign", "ni"], { top: 3, left: 0, bottom: 4, right: 1 })).toEqual([
      { row: 3, key: "campaign", value: "" },
      { row: 3, key: "ni", value: "" },
      { row: 4, key: "campaign", value: "" },
      { row: 4, key: "ni", value: "" },
    ]);
  });
});
