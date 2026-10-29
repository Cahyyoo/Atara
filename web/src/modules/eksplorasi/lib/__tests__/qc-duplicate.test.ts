import { describe, expect, it } from "vitest";
import {
  duplicatePairs,
  isOutsideTolerance,
  linearFit,
  pairRange,
  isRpdFlagged,
  isRpdWithin,
  relativeDifference,
  rpd,
  rpdDistribution,
  rpdSeries,
  type DuplicateRow,
} from "@/modules/eksplorasi/lib/qc-duplicate";

/** The duplicate charts' arithmetic, without a database. */

const row = (sampleId: string, original: string | null, duplicate: string | null): DuplicateRow =>
  ({ sampleId, originalId: `${sampleId}-O`, o_ni: original, d_ni: duplicate }) as DuplicateRow;

describe("a duplicate's pair", () => {
  it("is the original (X) against the duplicate (Y), and leaves out a value that is not a number", () => {
    const { pairs, skipped } = duplicatePairs([row("D1", "1.00", "1,05"), row("D2", "<0.01", "0.9"), row("D3", "1.2", null)], "ni");
    expect(pairs).toEqual([{ sampleId: "D1", originalId: "D1-O", x: 1, y: 1.05 }]);
    expect(skipped).toBe(2);
  });
});

describe("the ±10% band", () => {
  it("holds a duplicate up to 10% either way of its original, and no further", () => {
    expect(isOutsideTolerance({ x: 1, y: 1.1 })).toBe(false);
    expect(isOutsideTolerance({ x: 1, y: 0.9 })).toBe(false);
    expect(isOutsideTolerance({ x: 1, y: 1.11 })).toBe(true);
    expect(isOutsideTolerance({ x: 2, y: 1.7 })).toBe(true);
    expect(relativeDifference({ x: 2, y: 2.1 })).toBeCloseTo(0.05);
  });
});

describe("the trend line", () => {
  it("fits a straight line with its R², 1 when every pair lies on it", () => {
    const fit = linearFit([
      { x: 1, y: 2.1 },
      { x: 2, y: 4.1 },
      { x: 3, y: 6.1 },
    ])!;
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(0.1);
    expect(fit.r2).toBeCloseTo(1);
    expect(
      linearFit([
        { x: 1, y: 1 },
        { x: 2, y: 3 },
        { x: 3, y: 2 },
      ])!.r2
    ).toBeCloseTo(0.25);
  });

  it("is not drawn with fewer than two pairs, or every original the same", () => {
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
    expect(
      linearFit([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ])
    ).toBeNull();
  });
});

describe("the axes", () => {
  it("share one range, from 0 for assays, with room above the highest value", () => {
    const range = pairRange([
      { x: 1, y: 1.2 },
      { x: 2.5, y: 2.4 },
    ])!;
    expect(range.min).toBe(0);
    expect(range.max).toBeGreaterThan(2.5);
    expect(pairRange([])).toBeNull();
  });
});

describe("a pair's RPD", () => {
  it("is the difference over the two readings' mean, taking neither as the truth", () => {
    expect(rpd({ x: 1, y: 1.1 })).toBeCloseTo(0.1 / 1.05);
    expect(rpd({ x: 1.1, y: 1 })).toBeCloseTo(0.1 / 1.05);
    expect(rpd({ x: 1, y: 0 })).toBe(2);
    expect(rpd({ x: 0, y: 0 })).toBe(0);
    expect(rpd({ x: 1, y: -1 })).toBeNull();
  });

  it("is marked at 20% or more, and within the CRM List's 10% up to 10% itself", () => {
    expect(isRpdFlagged({ rpd: 0.2 })).toBe(true);
    expect(isRpdFlagged({ rpd: 0.19 })).toBe(false);
    expect(isRpdWithin({ rpd: 0.1 })).toBe(true);
    expect(isRpdWithin({ rpd: 0.11 })).toBe(false);
  });
});

describe("the RPD graph", () => {
  it("keeps each pair at its place in the pairs' order, leaving out a pair with no RPD", () => {
    const series = rpdSeries([
      { sampleId: "D1", originalId: "F1", x: 1, y: 1 },
      { sampleId: "D2", originalId: "F2", x: 1, y: -1 },
      { sampleId: "D3", originalId: "F3", x: 1, y: 3 },
    ]);
    expect(series).toEqual([
      { index: 1, sampleId: "D1", originalId: "F1", rpd: 0 },
      { index: 3, sampleId: "D3", originalId: "F3", rpd: 1 },
    ]);
  });
});

describe("the RPD distribution", () => {
  it("sorts the RPDs, each at the share of pairs with an RPD no larger", () => {
    const point = (index: number, value: number) => ({ index, sampleId: `D${index}`, originalId: `F${index}`, rpd: value });
    const distribution = rpdDistribution([point(1, 0.3), point(2, 0.05), point(3, 0.1), point(4, 0.02)]);
    expect(distribution.map((entry) => [entry.rpd, entry.cumulative])).toEqual([
      [0.02, 0.25],
      [0.05, 0.5],
      [0.1, 0.75],
      [0.3, 1],
    ]);
    expect(rpdDistribution([])).toEqual([]);
  });
});
