import { describe, expect, it } from "vitest";
import { normalizeSampleKey, sampleIdentKeys, subKey, withoutSacks } from "@/lib/sample-ident";
import { mapPastedRows, pastedKeys, type PasteTarget } from "@/lib/paste-map";
import { findOverwrites, withoutOverwrites } from "@/lib/overwrite";

/**
 * Pasting by Sample ID without ticking, sub-samples, and never replacing an
 * earlier result by accident -- the rules, without a database or a screen.
 */

function target(overrides: Partial<PasteTarget> & { id: string }): PasteTarget {
  return { labCode: `SPR.QLAB.20260917.00${overrides.id}`, sampleIdent: null, values: {}, ...overrides };
}

describe("normalizeSampleKey", () => {
  it("reads spaces and slashes as the same separator", () => {
    expect(normalizeSampleKey("LAM SAP S4/B24/3475.3").full).toBe("LAM/SAP/S4/B24/3475.3");
    expect(normalizeSampleKey("  lam  sap s4 / b24/3475.3 ").full).toBe("LAM/SAP/S4/B24/3475.3");
    expect(normalizeSampleKey("LAM/SAP/S4/B24/3475.3").code).toBeNull();
  });

  it("peels a bracketed code off as a sub-sample", () => {
    const key = normalizeSampleKey("lam sap s4/b24/3475.3 ( -20 )");
    expect(key).toEqual({ base: "LAM/SAP/S4/B24/3475.3", code: "-20", full: "LAM/SAP/S4/B24/3475.3 (-20)" });
  });

  it("keeps a Lab Code's own form, taking only its sub code", () => {
    const key = normalizeSampleKey("spr.qlab.20260917.001 (-20)", { slashes: false });
    expect(key).toEqual({ base: "SPR.QLAB.20260917.001", code: "-20", full: "SPR.QLAB.20260917.001 (-20)" });
  });

  it("writes a sub's key as its parent's with the code in brackets", () => {
    expect(subKey("LAM/SAP/S4/B24/3475.3", "-20")).toBe("LAM/SAP/S4/B24/3475.3 (-20)");
    expect(subKey("LAM/SAP/S4/B24/3475.3", null)).toBe("LAM/SAP/S4/B24/3475.3");
  });
});

/**
 * The hand the id was written in, both ways round. A stored Sample ID writes
 * its leading group with spaces; an operator reading one off an older sheet,
 * or a sheet exported before the change, writes slashes throughout. Either
 * finds the record.
 */
describe("pasting a Sample ID written in the other hand", () => {
  const stored = target({ id: "1", sampleIdent: "LAM SAP S4/B24/3475.3" });

  it("finds a record stored with spaces from an all-slash key", () => {
    const result = mapPastedRows([["Sample ID", "Fe"], ["LAM/SAP/S4/B24/3475.3", "20"]], [stored]);
    expect(result.rows[0]).toMatchObject({ status: "update", targetId: "1", values: { fe: 20 } });
  });

  it("finds its sub-sample too", () => {
    const sub = target({ id: "2", sampleIdent: "LAM SAP S4/B24/3475.3 (-20)" });
    const result = mapPastedRows(
      [["Sample ID", "Fe"], ["LAM/SAP/S4/B24/3475.3 (-20)", "20"]],
      [stored, sub]
    );
    expect(result.rows[0]).toMatchObject({ status: "update", targetId: "2" });
  });

  it("reads a stored id as the same key whichever hand it is in", () => {
    expect(sampleIdentKeys("LAM SAP S4/B24/3475.3", null)).toEqual(
      sampleIdentKeys("LAM/SAP/S4/B24/3475.3", null)
    );
  });
});

describe("pasting by Sample ID", () => {
  const parent = target({ id: "1", sampleIdent: "LAM/SAP/S4/B24/3475.3", values: { ni: 1.2 } });

  it("finds a slash-separated Sample ID from a space-separated one", () => {
    const result = mapPastedRows([["Sample ID", "Fe"], ["LAM SAP S4/B24/3475.3", "20"]], [parent]);
    expect(result.rows[0]).toMatchObject({ status: "update", targetId: "1", values: { fe: 20 } });
  });

  it("makes a new sub-sample of a matched sample from a bracketed code", () => {
    const result = mapPastedRows(
      [["Sample ID", "Ni"], ["LAM SAP S4/B24/3475.3", "1.2"], ["LAM SAP S4/B24/3475.3 (-20)", "1.4"]],
      [parent]
    );
    expect(result.rows[1]).toMatchObject({
      status: "create",
      targetId: null,
      sub: { parentId: "1", code: "-20" },
      values: { ni: 1.4 },
      changes: { ni: { from: null, to: 1.4 } },
    });
    expect(result.summary).toMatchObject({ create: 1, unchanged: 1, unknown: 0 });
  });

  it("fills a sub-sample that is already there rather than making another", () => {
    const sub = target({ id: "9", sampleIdent: "LAM/SAP/S4/B24/3475.3 (-20)", parentId: "1" });
    const result = mapPastedRows([["Sample ID", "Ni"], ["LAM SAP S4/B24/3475.3 (-20)", "1.4"]], [parent, sub]);
    expect(result.rows[0]).toMatchObject({ status: "update", targetId: "9" });
  });

  it("makes no sub where none can be made, and gives a sub no subs of its own", () => {
    const sub = target({ id: "9", sampleIdent: "LAM/SAP/S4/B24/3475.3 (-20)", parentId: "1" });
    const filling = mapPastedRows([["Sample ID", "Ni"], ["LAM SAP S4/B24/3475.3 (-20)", "1.4"]], [parent], new Date(), {
      subs: false,
    });
    expect(filling.rows[0].status).toBe("unknown");

    const nested = mapPastedRows([["Sample ID", "Ni"], ["LAM SAP S4/B24/3475.3 (-20) (+40)", "1.4"]], [parent, sub]);
    expect(nested.rows[0].status).toBe("unknown");
  });

  it("refuses the same sub twice in one paste", () => {
    const result = mapPastedRows(
      [["Sample ID", "Ni"], ["LAM SAP S4/B24/3475.3 (-20)", "1.4"], ["LAM/SAP/S4/B24/3475.3 (-20)", "1.5"]],
      [parent]
    );
    expect(result.rows.map((row) => row.status)).toEqual(["create", "invalid"]);
  });

  it("marks the rows that would replace an earlier result", () => {
    const result = mapPastedRows([["Sample ID", "Ni", "Fe"], ["LAM SAP S4/B24/3475.3", "1.35", "20"]], [parent]);
    expect(result.rows[0].overwrites).toEqual([{ field: "ni", from: 1.2, to: 1.35 }]);
    expect(result.summary.overwrite).toBe(1);
  });

  it("reads the keys a block names, for looking them up first", () => {
    expect(pastedKeys([["Sample ID", "Ni"], ["A B", "1"], ["A B", "2"], ["C (-20)", "3"]])).toEqual({
      keys: ["A B", "C (-20)"],
    });
    // A column headed Lab Code holds Sample IDs too.
    expect(pastedKeys([["Lab Code", "Ni"], ["LAM/SAM/1", "1"]])).toEqual({ keys: ["LAM/SAM/1"] });
    expect(pastedKeys([["Ni", "Fe"], ["1", "2"]])).toBeNull();
  });
});

describe("the sack count is not counted", () => {
  const stored = target({ id: "1", sampleIdent: "LAM/SAM/S2/PA4/B10/3778.1/25", sackCount: 25 });

  it("drops only a trailing sack count the record holds", () => {
    expect(withoutSacks("LAM/SAM/S2/PA4/B10/3778.1/25", 25)).toBe("LAM/SAM/S2/PA4/B10/3778.1");
    expect(withoutSacks("LAM/SAM/S2/PA4/B10/3778.1/25", 12)).toBe("LAM/SAM/S2/PA4/B10/3778.1/25");
    expect(withoutSacks("LAM/SAM/S2/PA4/B10/3778.1", null)).toBe("LAM/SAM/S2/PA4/B10/3778.1");
    expect(sampleIdentKeys("LAM/SAM/1/25 (-20)", 25)).toEqual(["LAM/SAM/1/25 (-20)", "LAM/SAM/1 (-20)"]);
  });

  it("matches the sheet in the screenshot: Lab Code heading, Sample IDs without sacks", () => {
    const result = mapPastedRows(
      [
        ["Lab Code", "Ni (%)"],
        ["LAM/SAM/S2/PA4/B10/3778.1 (-20)", "2.16"],
        ["LAM/SAM/S2/PA4/B10/3778.1", "2.16"],
      ],
      [stored],
      new Date(),
      { scope: "all" }
    );
    expect(result.rows.map((row) => row.status)).toEqual(["create", "update"]);
    expect(result.rows[0].sub).toEqual({ parentId: "1", code: "-20" });
    expect(result.rows[1].targetId).toBe("1");
  });

  it("still matches a Sample ID pasted with its sack count", () => {
    const result = mapPastedRows([["Sample ID", "Ni"], ["LAM/SAM/S2/PA4/B10/3778.1/25", "2"]], [stored]);
    expect(result.rows[0].targetId).toBe("1");
  });

  it("guesses nothing where leaving the sacks out fits two samples", () => {
    const other = target({ id: "2", sampleIdent: "LAM/SAM/S2/PA4/B10/3778.1/30", sackCount: 30 });
    const result = mapPastedRows([["Sample ID", "Ni"], ["LAM/SAM/S2/PA4/B10/3778.1", "2"]], [stored, other]);
    expect(result.rows[0]).toMatchObject({ status: "invalid", message: "ambiguous" });

    const told = mapPastedRows([["Sample ID", "Ni"], ["X/1", "2"]], [], new Date(), {
      scope: "all",
      ambiguous: ["X/1"],
    });
    expect(told.rows[0]).toMatchObject({ status: "invalid", message: "ambiguous" });
  });

  it("says a Sample ID was not found when nothing was ticked", () => {
    const result = mapPastedRows([["Sample ID", "Ni"], ["NOPE/1", "2"]], [], new Date(), { scope: "all" });
    expect(result.rows[0]).toMatchObject({ status: "unknown", message: "notFound" });
  });
});

describe("findOverwrites", () => {
  it("lists only results that hold a value now and would hold another", () => {
    expect(
      findOverwrites(
        { ni: 1.2, fe: null, co: 0.1, measurementMethod: "ICP" },
        { ni: 1.35, fe: 20, co: 0.1, measurementMethod: "XRF", remarks: "re-run" }
      )
    ).toEqual([
      { field: "ni", from: 1.2, to: 1.35 },
      { field: "measurementMethod", from: "ICP", to: "XRF" },
    ]);
  });

  it("counts emptying a result as replacing it, and the same figure as no change", () => {
    expect(findOverwrites({ ni: 1.2 }, { ni: null })).toEqual([{ field: "ni", from: 1.2, to: null }]);
    expect(findOverwrites({ ni: 1.2 }, { ni: "1.20" })).toEqual([]);
    expect(findOverwrites({ ni: { toString: () => "1.2" } }, { ni: 1.2 })).toEqual([]);
  });

  it("leaves the replacing fields out when asked to keep what is there", () => {
    expect(withoutOverwrites({ ni: 1.2, fe: null }, { ni: 1.35, fe: 20 })).toEqual({ fe: 20 });
  });
});
