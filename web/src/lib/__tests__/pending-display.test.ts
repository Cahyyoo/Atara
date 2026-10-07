import { describe, expect, it } from "vitest";
import { DELAY_MS, FLOOR_MS, pendingWindow } from "@/lib/pending-display";

const T0 = 1_000_000;

describe("nothing pending", () => {
  it("shows nothing and asks for no timer", () => {
    expect(pendingWindow(null, T0)).toEqual({ visible: false, recheckIn: null });
  });
});

describe("a wait shorter than the quiet window", () => {
  /**
   * The case that matters most here. Measured on this database, every page and
   * every endpoint answers in 15-35ms. If the indicator showed at 0ms it would
   * flash on every single interaction — worse than showing nothing at all.
   */
  it("never appears for the 15-35ms this app actually takes", () => {
    for (const elapsed of [15, 20, 25, 33, 35]) {
      const settled = T0 + elapsed;
      expect(pendingWindow(T0, settled, settled).visible).toBe(false);
      // And nothing is left scheduled, so it cannot appear afterwards either.
      expect(pendingWindow(T0, settled, settled).recheckIn).toBeNull();
    }
  });

  it("stays hidden right up to the threshold", () => {
    expect(pendingWindow(T0, T0 + DELAY_MS - 1).visible).toBe(false);
  });
});

describe("a wait past the quiet window", () => {
  it("appears once the threshold passes", () => {
    expect(pendingWindow(T0, T0 + DELAY_MS).visible).toBe(true);
    expect(pendingWindow(T0, T0 + 5000).visible).toBe(true);
  });

  it("asks to be rechecked exactly when it would appear, not sooner", () => {
    expect(pendingWindow(T0, T0).recheckIn).toBe(DELAY_MS);
    expect(pendingWindow(T0, T0 + 50).recheckIn).toBe(DELAY_MS - 50);
  });

  it("stays up for its minimum even when the answer lands immediately after", () => {
    // Shown at 200ms, answered at 210ms: it holds to 500ms rather than
    // twitching off the screen 10ms after arriving.
    const settled = T0 + DELAY_MS + 10;
    expect(pendingWindow(T0, settled, settled).visible).toBe(true);
    expect(pendingWindow(T0, T0 + DELAY_MS + FLOOR_MS - 1, settled).visible).toBe(true);
    expect(pendingWindow(T0, T0 + DELAY_MS + FLOOR_MS, settled).visible).toBe(false);
  });

  it("leaves with the answer when the wait outlasted the minimum anyway", () => {
    // Two seconds of work: the floor has long passed, so there is no extra hold.
    const settled = T0 + 2000;
    expect(pendingWindow(T0, settled, settled).visible).toBe(false);
  });
});

describe("the rule that it may never slow anything down", () => {
  /**
   * The floor holds the indicator, never the work. For every wait, the moment
   * the indicator is allowed to leave must not be later than the answer itself
   * unless the indicator had genuinely been shown.
   */
  it("adds no hold at all to any wait that never showed an indicator", () => {
    for (const elapsed of [0, 1, 50, 100, DELAY_MS - 1]) {
      const settled = T0 + elapsed;
      const result = pendingWindow(T0, settled, settled);
      expect(result.visible).toBe(false);
      expect(result.recheckIn).toBeNull();
    }
  });

  it("never holds longer than the quiet window plus the floor", () => {
    const settled = T0 + DELAY_MS;
    let now = settled;
    // Walk forward and find when it clears; it must be bounded.
    let guard = 0;
    while (pendingWindow(T0, now, settled).visible && guard < 100) {
      now += 50;
      guard += 1;
    }
    expect(now - T0).toBeLessThanOrEqual(DELAY_MS + FLOOR_MS);
  });
});
