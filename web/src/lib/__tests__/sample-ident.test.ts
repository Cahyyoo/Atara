import { describe, expect, it } from "vitest";

import {
  composeSampleIdent,
  duplicateIdents,
  normalizeSampleKey,
  sampleIdentForms,
  searchIdentForms,
  type SampleIdentParts,
} from "@/lib/sample-ident";

/** A complete production sample, as the form would hand it over. */
const COMPLETE: SampleIdentParts = {
  place: "MOL",
  rockType: "LIM",
  nonProd: null,
  sir: "3",
  pit: "A4",
  bargingNo: "42",
  sequenceNo: 919,
  sampleNo: 3,
  sackCount: 12,
};

describe("composeSampleIdent", () => {
  it("builds the shape the lab writes on the sheet", () => {
    expect(composeSampleIdent({ ...COMPLETE, nonProd: "TP" })).toBe(
      "MOL LIM TP S3/PA4/B42/919.3/12"
    );
  });

  it("drops the non-production segment on an ordinary sample", () => {
    // This is the form on the attached sheet: no code, and no double space
    // where it would have been.
    expect(composeSampleIdent(COMPLETE)).toBe("MOL LIM S3/PA4/B42/919.3/12");
  });

  it("treats an empty non-production code the same as none", () => {
    expect(composeSampleIdent({ ...COMPLETE, nonProd: "   " })).toBe(
      "MOL LIM S3/PA4/B42/919.3/12"
    );
  });

  it("accepts the barging run with or without its B prefix", () => {
    // Operators write B.48, B48 or 48 depending on where they copied it from.
    for (const written of ["B.42", "B42", "42", "b.42"]) {
      expect(composeSampleIdent({ ...COMPLETE, bargingNo: written })).toBe(
        "MOL LIM S3/PA4/B42/919.3/12"
      );
    }
  });

  // The barging run is the one free-text part, so it is the one that could
  // carry a separator of its own into an id that has two of them.
  it("keeps a separator typed inside the barging run out of the id", () => {
    for (const written of ["B 42", "B/42", "4 2", "4/2"]) {
      expect(composeSampleIdent({ ...COMPLETE, bargingNo: written }), written).toBe(
        "MOL LIM S3/PA4/B42/919.3/12"
      );
    }
  });

  it("upper-cases and trims what was typed", () => {
    expect(
      composeSampleIdent({ ...COMPLETE, place: " mol ", rockType: "lim", pit: "a4" })
    ).toBe("MOL LIM S3/PA4/B42/919.3/12");
  });

  it("keeps a zero, which is a real number here", () => {
    expect(composeSampleIdent({ ...COMPLETE, sackCount: 0 })).toBe(
      "MOL LIM S3/PA4/B42/919.3/0"
    );
  });

  it("leaves out whichever part is missing and closes up around it", () => {
    const withoutEach: [keyof SampleIdentParts, string][] = [
      ["rockType", "MOL S3/PA4/B42/919.3/12"],
      ["sir", "MOL LIM/PA4/B42/919.3/12"],
      ["pit", "MOL LIM S3/B42/919.3/12"],
      ["bargingNo", "MOL LIM S3/PA4/919.3/12"],
      ["sackCount", "MOL LIM S3/PA4/B42/919.3"],
    ];

    for (const [field, expected] of withoutEach) {
      expect(composeSampleIdent({ ...COMPLETE, [field]: null }), `without ${field}`).toBe(
        expected
      );
    }
  });

  // The place is the one part that is not optional, so this is the only way to
  // end up with no id while something is filled in.
  it("composes nothing without a place, however much else is known", () => {
    expect(composeSampleIdent({ ...COMPLETE, place: null })).toBeNull();
    expect(composeSampleIdent({ ...COMPLETE, place: "  " })).toBeNull();
  });

  it("composes nothing at all from an empty identity", () => {
    expect(composeSampleIdent({})).toBeNull();
  });

  it("gives a sample known only by its place an id all the same", () => {
    expect(composeSampleIdent({ place: "MOL" })).toBe("MOL");
  });

  it("writes whichever running number is known, and joins them when both are", () => {
    const base = { place: "MOL" };
    expect(composeSampleIdent({ ...base, sequenceNo: 919 })).toBe("MOL/919");
    expect(composeSampleIdent({ ...base, sampleNo: 3 })).toBe("MOL/3");
    expect(composeSampleIdent({ ...base, sequenceNo: 919, sampleNo: 3 })).toBe("MOL/919.3");
  });

  // "0" is falsy, so filtering the segments for truthiness would drop the sack
  // count and say nothing about it.
  it("keeps a zero sack count as its own segment", () => {
    expect(composeSampleIdent({ place: "MOL", sackCount: 0 })).toBe("MOL/0");
  });

  it("treats a blank string as missing rather than as a segment", () => {
    expect(composeSampleIdent({ ...COMPLETE, pit: "  " })).toBe("MOL LIM S3/B42/919.3/12");
  });
});

describe("duplicateIdents", () => {
  it("names an id that appears twice, once", () => {
    expect(duplicateIdents(["A/1", "A/2", "A/1", "A/1"])).toEqual(["A/1"]);
  });

  it("finds nothing in a list where every id differs", () => {
    expect(duplicateIdents(["A/1", "A/2", "A/3"])).toEqual([]);
  });

  /**
   * The reason this takes nulls at all. A barcode may be printed before the
   * barging run is known, so several blocks of one generate can compose no id;
   * treating those as clashing with each other would refuse an ordinary batch.
   */
  it("does not count two unidentified samples as a clash", () => {
    expect(duplicateIdents([null, null, "A/1", null])).toEqual([]);
  });

  it("returns them in the order they were first seen", () => {
    expect(duplicateIdents(["B/1", "A/1", "B/1", "A/1"])).toEqual(["B/1", "A/1"]);
  });
});

describe("sampleIdentForms", () => {
  it("gives a key of one segment the one shape it can have", () => {
    expect(sampleIdentForms("MOL")).toEqual(["MOL"]);
  });

  // The key cannot say whether "919.3" is a rock type or the running number,
  // so both shapes are asked for and the column settles it.
  it("offers both shapes of a two-segment key", () => {
    expect(sampleIdentForms("MOL/919.3")).toEqual(["MOL/919.3", "MOL 919.3"]);
  });

  it("walks the space/slash boundary along, the key itself first", () => {
    expect(sampleIdentForms("LAM/SAP/S4/B24/3475.3")).toEqual([
      "LAM/SAP/S4/B24/3475.3",
      "LAM SAP/S4/B24/3475.3",
      "LAM SAP S4/B24/3475.3",
      "LAM SAP S4 B24/3475.3",
    ]);
  });

  // The group holds at most four parts, so at most three separators, however
  // long the rest of the id runs on.
  it("stops at three spaces", () => {
    expect(sampleIdentForms("MOL/LIM/TP/S3/PA4/B42/919.3/12")).toHaveLength(4);
    expect(sampleIdentForms("MOL/LIM/TP/S3/PA4/B42/919.3/12").at(-1)).toBe(
      "MOL LIM TP S3/PA4/B42/919.3/12"
    );
  });

  it("has nothing to say about an empty key", () => {
    expect(sampleIdentForms("")).toEqual([]);
  });
});

describe("searchIdentForms", () => {
  it("costs nothing extra for a term with no separator in it", () => {
    expect(searchIdentForms("MOL")).toEqual(["MOL"]);
    expect(searchIdentForms("3475.3")).toEqual(["3475.3"]);
  });

  it("keeps a sub-sample's bracket on the end of every form", () => {
    expect(searchIdentForms("lam/sap/s4 (-20)")).toEqual([
      "LAM/SAP/S4 (-20)",
      "LAM SAP/S4 (-20)",
      "LAM SAP S4 (-20)",
    ]);
  });

  /**
   * A fragment the key reading would mangle is only ever found raw, so the
   * term as typed is kept alongside the forms.
   */
  it("keeps the term as it was typed where the key reading moved it", () => {
    expect(searchIdentForms("(-20")).toEqual(["(-20"]);
    expect(searchIdentForms("lam/")).toEqual(["lam/", "LAM"]);
  });

  // Case is not a difference worth a second LIKE: the collation ignores it.
  it("does not repeat a term the forms already cover but for its case", () => {
    expect(searchIdentForms("lam sap")).toEqual(["LAM/SAP", "LAM SAP"]);
  });

  it("has nothing to say about an empty term", () => {
    expect(searchIdentForms("   ")).toEqual([]);
  });
});

/**
 * The contract `resolvePastedKeys` leans on: whatever `composeSampleIdent`
 * writes, reading it as a key and asking for that key's forms gets the stored
 * id back. It is what makes narrowing by form a lookup rather than a guess,
 * and it fails loudly if a fifth group part or a new tail segment is ever
 * added without widening GROUP_SEPARATORS_MAX.
 */
describe("a composed id is always one of its key's forms", () => {
  const PARTS: SampleIdentParts = {
    place: "MOL",
    rockType: "LIM",
    nonProd: "TP",
    sir: "3",
    pit: "A4",
    bargingNo: "42",
    sequenceNo: 919,
    sampleNo: 3,
    sackCount: 12,
  };
  const OPTIONAL = [
    "rockType",
    "nonProd",
    "sir",
    "pit",
    "bargingNo",
    "sequenceNo",
    "sampleNo",
    "sackCount",
  ] as const;

  it("holds for every combination of parts that can be left out", () => {
    // Every subset of the eight optional parts: 256 identities, the place
    // always kept because without it there is no id to check.
    for (let mask = 0; mask < 1 << OPTIONAL.length; mask += 1) {
      const parts: SampleIdentParts = { ...PARTS };
      for (const [index, field] of OPTIONAL.entries()) {
        if (mask & (1 << index)) parts[field] = null;
      }

      const ident = composeSampleIdent(parts);
      expect(ident, JSON.stringify(parts)).not.toBeNull();
      expect(sampleIdentForms(normalizeSampleKey(ident!).base), ident!).toContain(ident);
    }
  });
});
