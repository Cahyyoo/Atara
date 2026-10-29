import { describe, expect, it } from "vitest";
import { blankLimit, blankPoints, blankSummary, blankValue, isAnomaly } from "@/modules/eksplorasi/lib/qc-blank";

/** The blank charts' and table's arithmetic, without a database. */

describe("a blank's reading", () => {
  it("is taken at the detection limit when written below it, and marked so", () => {
    expect(blankValue("<0.01")).toEqual({ value: 0.01, belowDetection: true });
    expect(blankValue("< 0,01")).toEqual({ value: 0.01, belowDetection: true });
    expect(blankValue("<=0.05")).toEqual({ value: 0.05, belowDetection: true });
    expect(blankValue("≤0.05")).toEqual({ value: 0.05, belowDetection: true });
  });

  it("is taken as written when the lab wrote a number, however small", () => {
    expect(blankValue("0.000001223")).toEqual({ value: 0.000001223, belowDetection: false });
    expect(blankValue("1.223E-6")).toEqual({ value: 0.000001223, belowDetection: false });
  });

  it("is no reading when it is not a number", () => {
    expect(blankValue(null)).toBeNull();
    expect(blankValue("")).toBeNull();
    expect(blankValue("n/a")).toBeNull();
    expect(blankValue("<")).toBeNull();
  });
});

describe("the Preferred Value", () => {
  it("reads as the CRM List writes it, with or without a sign", () => {
    expect(blankLimit("0.01")).toBe(0.01);
    expect(blankLimit("<=0.01")).toBe(0.01);
    expect(blankLimit("10")).toBe(10);
    expect(blankLimit(null)).toBeNull();
  });
});

describe("the blanks' points", () => {
  it("are at their place among the blanks, counting from 1, leaving out what is not a number", () => {
    const { points, skipped } = blankPoints([
      { sampleId: "B1", value: "0.02" },
      { sampleId: "B2", value: "n/a" },
      { sampleId: "B3", value: "<0.01" },
    ]);
    expect(points).toEqual([
      { sampleId: "B1", x: 1, y: 0.02, belowDetection: false },
      { sampleId: "B3", x: 3, y: 0.01, belowDetection: true },
    ]);
    expect(skipped).toBe(1);
  });
});

describe("the blank table's row", () => {
  it("counts a reading past the Preferred Value as an anomaly, and one at it as a pass", () => {
    expect(isAnomaly({ y: 0.01 }, 0.01)).toBe(false);
    expect(isAnomaly({ y: 0.011 }, 0.01)).toBe(true);
    const summary = blankSummary([{ y: 0.005 }, { y: 0.01 }, { y: 0.02 }, { y: 0.01 }], 0.01);
    expect(summary.n).toBe(4);
    expect(summary.mean).toBeCloseTo(0.01125);
    expect(summary.min).toBe(0.005);
    expect(summary.max).toBe(0.02);
    expect(summary.anomalies).toBe(1);
    expect(summary.anomalyShare).toBe(0.25);
  });

  it("has no anomalies to count without a Preferred Value, and no figures without readings", () => {
    expect(blankSummary([{ y: 1 }], null)).toMatchObject({ n: 1, anomalies: null, anomalyShare: null });
    expect(blankSummary([], 0.01)).toEqual({ n: 0, mean: null, min: null, max: null, anomalies: 0, anomalyShare: null });
  });
});
