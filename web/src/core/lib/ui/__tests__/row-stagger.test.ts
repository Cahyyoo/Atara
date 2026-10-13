import { describe, expect, it } from "vitest";
import { rowDelay, STAGGER_CEILING, STAGGER_LIMIT, STAGGER_STEP } from "@/core/lib/ui/row-stagger";

/**
 * A stagger that keeps growing stops being an animation and becomes a wait.
 * These pin the cap, because the failure is silent: the table still works, it
 * just takes two seconds to finish arriving and feels broken.
 */
describe("rowDelay", () => {
  it("steps evenly through the first rows", () => {
    expect(rowDelay(0)).toBe(0);
    expect(rowDelay(1)).toBeCloseTo(STAGGER_STEP);
    expect(rowDelay(5)).toBeCloseTo(5 * STAGGER_STEP);
  });

  it("stops growing at the cap instead of running off the page", () => {
    expect(rowDelay(STAGGER_LIMIT)).toBeCloseTo(STAGGER_CEILING);
    // A full page, and the largest page size the toolbar offers.
    expect(rowDelay(49)).toBeCloseTo(STAGGER_CEILING);
    expect(rowDelay(100)).toBeCloseTo(STAGGER_CEILING);
  });

  it("finishes arriving fast enough to read as one movement", () => {
    // Past about half a second a stagger reads as the table loading slowly
    // rather than as its rows appearing.
    expect(STAGGER_CEILING).toBeLessThanOrEqual(0.5);
  });

  it("never returns a delay that would hold a row back forever", () => {
    for (const index of [0, 1, 12, 13, 500, 10000]) {
      expect(Number.isFinite(rowDelay(index))).toBe(true);
      expect(rowDelay(index)).toBeLessThanOrEqual(STAGGER_CEILING);
    }
  });
});
