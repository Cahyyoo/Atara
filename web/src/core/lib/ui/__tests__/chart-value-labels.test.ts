import { describe, expect, it } from "vitest";

import { labelValue, placeValueLabels, type LabelCandidate } from "@/core/lib/ui/chart-value-labels";

/** Bars at arbitrary canvas positions; only the geometry matters here. */
function bars(values: (number | null)[]): LabelCandidate[] {
  return values.map((value, index) => ({ value, x: 100 + index * 20, y: 50 }));
}

describe("placeValueLabels", () => {
  it("puts a column's number above its top", () => {
    const [label] = placeValueLabels([{ value: 12, x: 100, y: 50 }], { axis: "x" });

    expect(label.text).toBe("12");
    expect(label.x).toBe(100);
    // Above, so a smaller y than the bar's end.
    expect(label.y).toBeLessThan(50);
  });

  it("puts a horizontal bar's number just past its end", () => {
    const [label] = placeValueLabels([{ value: 7, x: 100, y: 50 }], { axis: "y" });

    expect(label.x).toBeGreaterThan(100);
    expect(label.y).toBe(50);
  });

  it("appends the unit where one is given", () => {
    const [label] = placeValueLabels([{ value: 3.5, x: 0, y: 0 }], { axis: "y", suffix: " h" });
    expect(label.text).toBe("3.5 h");
  });

  /**
   * The rule the charts already used. Past the limit the numbers collide and
   * the chart is harder to read than it was without them, so they are dropped
   * and the tooltip carries the values instead.
   */
  it("drops the numbers once the columns are too crowded to read them", () => {
    expect(placeValueLabels(bars(Array(20).fill(1)), { axis: "x" })).toHaveLength(20);
    expect(placeValueLabels(bars(Array(60).fill(1)), { axis: "x" })).toHaveLength(0);
  });

  it("counts a grouped chart's series against that room", () => {
    // Thirty bars in fifteen pairs: the pairs are what compete for width.
    const thirty = bars(Array(30).fill(1));

    expect(placeValueLabels(thirty, { axis: "x", seriesPerGroup: 2 })).toHaveLength(30);
    expect(placeValueLabels(bars(Array(80).fill(1)), { axis: "x", seriesPerGroup: 2 })).toHaveLength(
      0
    );
  });

  // Horizontal bars run down the chart, so they never crowd sideways.
  it("labels horizontal bars however many there are", () => {
    expect(placeValueLabels(bars(Array(60).fill(1)), { axis: "y" })).toHaveLength(60);
  });

  it("skips a bar with no value rather than printing null", () => {
    const labels = placeValueLabels(bars([1, null, 3]), { axis: "x" });

    expect(labels.map((label) => label.text)).toEqual(["1", "3"]);
  });

  it("prints a zero, which is a real measurement here", () => {
    expect(placeValueLabels([{ value: 0, x: 0, y: 0 }], { axis: "y" })[0].text).toBe("0");
  });
});

/**
 * The number a growing bar prints.
 *
 * The labels always moved with the bars; only the text was frozen at the
 * final value, so a bar a fifth of the way to 38 already printed "38". Now the
 * text is derived from the bar's own end, and that derivation has one way to
 * go wrong that nothing else would catch: a pixel converted back to a value
 * rounds, so the chart can settle on a number that disagrees with its own
 * tooltip and its own export. Nothing crashes when that happens -- it just
 * quietly reads wrong.
 */
describe("labelValue", () => {
  it("climbs with the bar instead of jumping to the answer", () => {
    expect(labelValue(9, 38)).toBe(9);
    expect(labelValue(20, 38)).toBe(20);
    expect(labelValue(38, 38)).toBe(38);
  });

  /**
   * The test the clamp exists for. Both of these are the resting frame with a
   * pixel's worth of rounding either way, and both must print what the data
   * says -- not 13.2, and not 13.4.
   */
  it("settles on the stored value, from either side of it", () => {
    expect(labelValue(13.34, 13.3)).toBe(13.3);
    expect(labelValue(13.29, 13.3)).toBe(13.3);
  });

  it("never shows more precision than the answer has", () => {
    // A count is whole at every frame; an hours figure keeps its one place.
    expect(labelValue(19.7364, 38)).toBe(20);
    expect(labelValue(7.28714, 13.3)).toBe(7.3);
    expect(String(labelValue(2.4000000000000004, 13.3))).toBe("2.4");
  });

  it("falls back to the answer when there is no reading to take", () => {
    // No scale on the chart, or a pixel outside it. Also the reduced-motion
    // case in effect: with animation off the bar is already at rest.
    expect(labelValue(undefined, 13.3)).toBe(13.3);
    expect(labelValue(Number.NaN, 42)).toBe(42);
  });

  it("does not let a bar overshoot its own length", () => {
    expect(labelValue(99, 38)).toBe(38);
  });

  it("clamps the other way for a negative figure", () => {
    // None of the five charts produces one today -- counts and durations are
    // never negative -- but an inverted clamp would be silent if one appeared.
    expect(labelValue(-99, -5)).toBe(-5);
    expect(labelValue(-2, -5)).toBe(-2);
  });

  it("prints a zero-length bar as zero", () => {
    expect(labelValue(0, 12)).toBe(0);
  });
});
