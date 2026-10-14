import { describe, expect, it } from "vitest";
import { assayKey, assayWhere, groupDuplicates } from "@/modules/lab/lib/records/assay-duplicates";

describe("assayKey", () => {
  it("reads results the way they are stored, to three decimals", () => {
    expect(assayKey({ ni: 1.86, fe: "44.4" })).toBe(assayKey({ ni: "1.860", fe: 44.4004 }));
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
    expect(where.ni).toBe(1.86);
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
