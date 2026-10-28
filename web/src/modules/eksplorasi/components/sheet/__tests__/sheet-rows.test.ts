import { describe, expect, it } from "vitest";
import { asLoaded, hasAssay, lockCounts, type SheetRow } from "@/modules/eksplorasi/components/sheet/sheet-rows";

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
