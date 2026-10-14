import { describe, expect, it } from "vitest";
import { assayKey, assayWhere, duplicateGroups, groupDuplicates } from "@/modules/lab/lib/records/assay-duplicates";

describe("assayKey", () => {
  it("reads results the way they are stored, to ten decimals", () => {
    expect(assayKey({ ni: 1.86, fe: "44.4" })).toBe(assayKey({ ni: "1.8600", fe: 44.40000000001 }));
    expect(assayKey({ zn: 0.0303 })).not.toBe(assayKey({ zn: 0.03 }));
    expect(assayKey({ ni: 1.86 })).not.toBe(assayKey({ ni: 1.861 }));
  });

  it("tells an empty result from a zero one", () => {
    expect(assayKey({ ni: 1.86, co: 0 })).not.toBe(assayKey({ ni: 1.86, co: null }));
  });

  it("has nothing to say about a row with no results", () => {
    expect(assayKey({})).toBeNull();
    expect(assayKey({ ni: null, fe: "" })).toBeNull();
  });
});

describe("assayWhere", () => {
  it("asks for every result, empty ones as empty", () => {
    const where = assayWhere({ ni: "1.8604" });
    expect(where.ni).toBe(1.8604);
    expect(where.fe).toBeNull();
    expect(Object.keys(where)).toHaveLength(18);
  });
});

describe("groupDuplicates", () => {
  it("pairs each row with the others that read the same, and leaves the rest out", () => {
    const same = assayKey({ ni: 1.86, fe: 44.4 });
    const duplicates = groupDuplicates([
      { id: 2, key: same },
      { id: 3, key: assayKey({ ni: 1.5 }) },
      { id: 4, key: same },
      { id: 5, key: null },
      { id: 6, key: null },
      { id: 7, key: same },
    ]);
    expect(duplicates.get(2)).toEqual([4, 7]);
    expect(duplicates.get(7)).toEqual([2, 4]);
    expect(duplicates.has(3)).toBe(false);
    expect(duplicates.has(5)).toBe(false);
  });
});

describe("duplicateGroups", () => {
  it("lists rows alike among themselves once, then rows like a stored sample", () => {
    expect(
      duplicateGroups([
        { row: 7, label: "A-7", lines: [2, 3] },
        { row: 3, label: "A-3", lines: [2, 7] },
        { row: 5, label: "A-5", samples: ["MOL B7/1.2"] },
        { row: 2, label: "A-2", lines: [3, 7], samples: ["LAM B1/4"] },
      ])
    ).toEqual([
      {
        kind: "rows",
        rows: [
          { row: 2, label: "A-2" },
          { row: 3, label: "A-3" },
          { row: 7, label: "A-7" },
        ],
      },
      { kind: "stored", row: 2, label: "A-2", samples: ["LAM B1/4"] },
      { kind: "stored", row: 5, label: "A-5", samples: ["MOL B7/1.2"] },
    ]);
  });
});
