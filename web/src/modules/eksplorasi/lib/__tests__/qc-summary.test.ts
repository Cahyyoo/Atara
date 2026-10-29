import { describe, expect, it } from "vitest";
import { controlLimits, standardFigures } from "@/modules/eksplorasi/lib/qc-control";
import { duplicateSummary, monthRange } from "@/modules/eksplorasi/lib/qc-duplicate";

/** The standard and duplicate tables' arithmetic, without a database. */

describe("a standard table row", () => {
  const limits = controlLimits("1.00", "0.10");

  it("gives the share of assays within 1, 2 and 3 SD, an assay exactly 2 SD off still within", () => {
    // z = 0, +0.5, -1.5, +2 (exactly), +3.5; "<0.01" is no assay.
    const figures = standardFigures(["1.00", "1.05", "0.85", "1.20", "1.35", "<0.01", null], limits);
    expect(figures.n).toBe(5);
    expect(figures.mean).toBeCloseTo(1.09);
    expect(figures.min).toBe(0.85);
    expect(figures.max).toBe(1.35);
    expect(figures.within1).toBeCloseTo(2 / 5);
    expect(figures.within2).toBeCloseTo(4 / 5);
    expect(figures.within3).toBeCloseTo(4 / 5);
    expect(figures.outside2).toBeCloseTo(1 / 5);
  });

  it("has no shares without the CRM List's value and SD, and no figures without assays", () => {
    expect(standardFigures(["1.00"], null)).toMatchObject({ n: 1, mean: 1, within1: null, outside2: null });
    expect(standardFigures([], limits)).toEqual({
      n: 0,
      mean: null,
      min: null,
      max: null,
      within1: null,
      within2: null,
      within3: null,
      outside2: null,
    });
  });
});

describe("a month of the duplicates' date", () => {
  it("runs from its first day up to the next month's", () => {
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-11-01" });
    expect(monthRange("2026-12")).toEqual({ from: "2026-12-01", to: "2027-01-01" });
  });
});

describe("a duplicate table row", () => {
  it("counts every pair, and the RPD over the pairs that have one", () => {
    const summary = duplicateSummary(
      [
        { sampleId: "D1", originalId: "F1", x: 1, y: 1.1 },
        { sampleId: "D2", originalId: "F2", x: 2, y: 2 },
        { sampleId: "D3", originalId: "F3", x: 1, y: -1 },
      ],
      2
    );
    // D3 averages zero, so it has no RPD; the two skipped pairs are counted all the same.
    expect(summary.nSamples).toBe(5);
    expect(summary.rpdSamples).toBe(2);
    expect(summary.averageRpd).toBeCloseTo(0.1 / 1.05 / 2);
    expect(summary.original).toEqual({ mean: 4 / 3, min: 1, max: 2 });
    expect(summary.duplicate.min).toBe(-1);
    expect(summary.duplicate.max).toBe(2);
  });

  it("has no figures without pairs", () => {
    expect(duplicateSummary([], 3)).toEqual({
      nSamples: 3,
      rpdSamples: 0,
      averageRpd: null,
      original: { mean: null, min: null, max: null },
      duplicate: { mean: null, min: null, max: null },
    });
  });
});
