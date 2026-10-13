import { describe, expect, it } from "vitest";
import {
  checkText,
  lineOf,
  pendingLines,
  progressOf,
  pruneVerdicts,
  rememberVerdicts,
  type Verdict,
} from "@/modules/lab/components/assay/paste-sheet/sheet-check";
import type { SheetRow } from "@/modules/lab/components/assay/paste-sheet/sheet-text";

/** Checking only what changed: a verdict is kept by a row's text until the text changes. */

const KEYS = ["sampleIdent", "ni"];

describe("a row's line", () => {
  it("is worked out once per row object, and again when the columns change", () => {
    const row = { sampleIdent: "A-1", ni: "1.5" };
    expect(lineOf(row, KEYS)).toBe("A-1\t1.5");
    expect(lineOf(row, KEYS)).toBe(lineOf(row, KEYS));
    expect(lineOf(row, ["ni"])).toBe("1.5");
  });
});

describe("what still needs checking", () => {
  it("is only the filled rows whose text has no verdict, each text once", () => {
    const rows: SheetRow[] = [{ sampleIdent: "A-1", ni: "1.5" }, {}, { sampleIdent: "A-2", ni: "1.6" }, { sampleIdent: "A-2", ni: "1.6" }];
    const cache = new Map<string, Verdict>([["A-1\t1.5", { labCode: "A-1", status: "update", changes: {} }]]);
    expect(pendingLines(rows, KEYS, cache)).toEqual(["A-2\t1.6"]);
  });

  it("is sent with the instrument's headings, and answered by line", () => {
    const batch = ["A-2\t1.6", "A-3\tx"];
    expect(checkText(KEYS, batch)).toBe("Sample ID\tNi (%)\nA-2\t1.6\nA-3\tx");

    const cache = new Map<string, Verdict>();
    rememberVerdicts(cache, batch, [
      { line: 2, labCode: "A-2", status: "update", changes: {} },
      { line: 3, labCode: "A-3", status: "invalid", changes: {}, field: "ni" },
    ]);
    expect(cache.get("A-3\tx")).toMatchObject({ status: "invalid", field: "ni" });
    expect(cache.get("A-2\t1.6")).not.toHaveProperty("line");
  });
});

describe("the sheet's count", () => {
  const rows: SheetRow[] = [
    { sampleIdent: "A-1", ni: "1.5" },
    { sampleIdent: "A-2", ni: "x" },
    { sampleIdent: "NOPE", ni: "1" },
    { sampleIdent: "A-4", ni: "2" },
    {},
  ];
  const cache = new Map<string, Verdict>([
    ["A-1\t1.5", { labCode: "A-1", status: "update", changes: {}, overwrites: [{ field: "ni", from: 1, to: 1.5 }] }],
    ["A-2\tx", { labCode: "A-2", status: "invalid", changes: {} }],
    ["NOPE\t1", { labCode: "NOPE", status: "unknown", changes: {} }],
  ]);

  it("waits until every filled row has a verdict", () => {
    expect(progressOf(rows, KEYS, cache)).toEqual({ filled: 4, checked: 3, summary: null });
  });

  it("is counted as the import counts it", () => {
    const all = new Map(cache).set("A-4\t2", { labCode: "A-4", status: "unchanged", changes: {} });
    expect(progressOf(rows, KEYS, all).summary).toEqual({
      total: 4,
      update: 1,
      create: 0,
      unchanged: 1,
      unknown: 1,
      invalid: 1,
      overwrite: 1,
    });
  });

  it("forgets verdicts for text no longer on the sheet", () => {
    const stale = new Map(cache).set("GONE\t9", { labCode: "GONE", status: "update", changes: {} });
    pruneVerdicts(stale, rows, KEYS);
    expect(stale.has("GONE\t9")).toBe(false);
    expect(stale.size).toBe(3);
  });
});
