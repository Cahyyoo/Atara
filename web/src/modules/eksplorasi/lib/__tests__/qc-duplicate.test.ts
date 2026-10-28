import { describe, expect, it } from "vitest";
import {
  duplicatePairs,
  isOutsideTolerance,
  linearFit,
  pairRange,
  relativeDifference,
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
