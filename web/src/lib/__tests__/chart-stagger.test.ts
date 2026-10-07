import { describe, expect, it } from "vitest";

import {
  CHART_REVEAL_MS,
  CHART_STAGGER_STEP_MS,
  CHART_STAGGER_TOTAL_MS,
  barEntranceDelay,
  barEntrancePlugin,
  barStagger,
  isEntering,
  type BarDelayContext,
} from "@/lib/chart-stagger";
import { CHART_ANIMATION_MS } from "@/lib/chart-theme";

/**
 * When each bar sets off.
 *
 * Two things are being held here, and both fail silently. The sizing has to
 * stay bounded however many bars a chart has, because a stagger longer than
 * the growth reads as a slow chart rather than an arriving one. And the guards
 * have to keep the delay off everything except the first arrival -- Chart.js
 * asks the same function for hover, for resize, and for the update that
 * happens when somebody changes a filter, and it asks with the same mode.
 */

/** A chart identity. Only its object-ness matters; nothing here reads it. */
const someChart = () => ({});

function context(over: Partial<BarDelayContext> = {}): BarDelayContext {
  return {
    type: "data",
    mode: "default",
    dataIndex: 3,
    dataset: { data: [0, 1, 2, 3, 4] },
    chart: someChart(),
    ...over,
  };
}

/** The hook as Chart.js calls it, with the mode it really passes. */
function finishUpdate(chart: object, mode?: string) {
  barEntrancePlugin.afterUpdate?.(
    chart as never,
    { mode } as never,
    undefined as never
  );
}

describe("how long a bar waits", () => {
  it("sends the first one off immediately", () => {
    expect(barStagger(0, 5)).toBe(0);
  });

  it("gives a small chart the whole step", () => {
    expect(barStagger(1, 5)).toBe(CHART_STAGGER_STEP_MS);
    expect(barStagger(4, 5)).toBe(4 * CHART_STAGGER_STEP_MS);
  });

  /**
   * The assertion that fails the moment anybody puts a fixed per-index step
   * back. Daily throughput draws one column per day, so a month-long range is
   * thirty-odd of them.
   */
  it("never spends longer than the stagger it promises, at any width", () => {
    for (let count = 1; count <= 400; count++) {
      expect(barStagger(count - 1, count)).toBeLessThanOrEqual(CHART_STAGGER_TOTAL_MS);
    }
  });

  /**
   * A wide chart compresses; it does not clump. This is what would break if
   * somebody "simplified" it into rowDelay's shape, which caps the index --
   * bars 12 to 29 would then all set off on the same frame, and a wave
   * followed by a slab is worse than no stagger at all.
   */
  it("keeps a wide chart's last bar behind its middle one", () => {
    expect(barStagger(29, 30)).toBeGreaterThan(barStagger(12, 30));
  });

  it("keeps the bars in order", () => {
    for (let index = 0; index < 29; index++) {
      expect(barStagger(index + 1, 30)).toBeGreaterThan(barStagger(index, 30));
    }
  });

  it("has nothing to stagger a lone bar against", () => {
    // `count - 1` would divide by zero, and one bar has no queue anyway.
    expect(barStagger(0, 1)).toBe(0);
    expect(barStagger(0, 0)).toBe(0);
  });

  /**
   * Written because Chart.js absorbs a falsy delay to zero -- `NaN` included.
   * A stagger that quietly stopped working would look exactly like a stagger
   * somebody had removed on purpose, and no other test would catch it.
   */
  it("never answers NaN, whatever it is handed", () => {
    expect(barStagger(undefined, 5)).toBe(0);
    expect(barStagger(Number.NaN, 5)).toBe(0);
    expect(barStagger(-1, 5)).toBe(0);
    expect(barStagger(3, 0)).toBe(0);
    // An index past the end -- a stale context during an update that
    // shortened the data -- behaves as the last bar, not as a longer wait.
    expect(barStagger(99, 5)).toBe(barStagger(4, 5));
  });

  it("fits the whole reveal inside a second", () => {
    expect(CHART_REVEAL_MS).toBe(CHART_ANIMATION_MS + CHART_STAGGER_TOTAL_MS);
    expect(CHART_REVEAL_MS).toBeLessThanOrEqual(1000);
    // Under the growth, so the last bar sets off while the first is still
    // moving -- which is what makes it one gesture rather than a queue.
    expect(CHART_STAGGER_TOTAL_MS).toBeLessThan(CHART_ANIMATION_MS);
  });
});

describe("what the delay applies to", () => {
  it("staggers a bar on the chart's first draw", () => {
    expect(barEntranceDelay(context({ dataIndex: 2 }))).toBe(barStagger(2, 5));
  });

  it("does not make a hover wait its turn", () => {
    // Hover has its own 400ms transition, so a delay here is honoured: the
    // highlight would trail the pointer across the chart.
    expect(barEntranceDelay(context({ mode: "active" }))).toBe(0);
  });

  it("does not hold a bar at a stale position through a resize", () => {
    expect(barEntranceDelay(context({ mode: "resize" }))).toBe(0);
  });

  it("does not stagger a dataset being shown or hidden", () => {
    expect(barEntranceDelay(context({ mode: "show" }))).toBe(0);
    expect(barEntranceDelay(context({ mode: "hide" }))).toBe(0);
  });

  /**
   * The guard is an allow-list for this reason: Chart.js passes mode strings
   * its own UpdateMode type does not declare. "attach" comes from a resize
   * before the canvas has a width.
   */
  it("refuses a mode nobody has heard of", () => {
    expect(barEntranceDelay(context({ mode: "attach" }))).toBe(0);
  });

  /**
   * The dataset-level context drives the shared options -- the gradient fill.
   * Its dataIndex is undefined, so without the type guard this would be NaN,
   * and NaN is falsy, so Chart.js would swallow it and nobody would know.
   */
  it("leaves the dataset and chart passes alone", () => {
    expect(barEntranceDelay(context({ type: "dataset", dataIndex: undefined }))).toBe(0);
    expect(barEntranceDelay(context({ type: "chart", dataIndex: undefined }))).toBe(0);
  });
});

describe("arriving once", () => {
  it("staggers every bar of the same arrival", () => {
    const chart = someChart();
    // Resolving a delay must not consume the flag; Chart.js asks per bar.
    expect(barEntranceDelay(context({ chart, dataIndex: 1 }))).toBeGreaterThan(0);
    expect(barEntranceDelay(context({ chart, dataIndex: 2 }))).toBeGreaterThan(0);
  });

  /**
   * The bug this whole flag exists for.
   *
   * A delayed bar does not wait at its new length, it waits at its old one --
   * and the number printed beside it is derived from that geometry. Staggering
   * a filter change would leave part of the chart showing the previous
   * filter's bars and the previous filter's figures, for a fifth of a second
   * after the filter changed.
   */
  it("does not re-introduce a chart when a filter redraws it", () => {
    const chart = someChart();
    expect(barEntranceDelay(context({ chart }))).toBeGreaterThan(0);

    finishUpdate(chart, "default");

    expect(barEntranceDelay(context({ chart }))).toBe(0);
  });

  /**
   * react-chartjs-2 calls `chart.update()` with no mode at all, and Chart.js
   * only defaults it to "default" further down, inside the dataset controller.
   * The plugin hook really does see undefined, so an arrival that only
   * recognised the string would never be marked finished -- and every filter
   * change would re-stagger.
   */
  it("recognises the update react-chartjs-2 actually makes", () => {
    const chart = someChart();
    finishUpdate(chart, undefined);

    expect(isEntering(chart)).toBe(false);
  });

  it("is not cancelled by a resize arriving mid-reveal", () => {
    const chart = someChart();
    finishUpdate(chart, "resize");

    expect(isEntering(chart)).toBe(true);
  });

  /**
   * The options object is shared -- two charts use columnOptions and three use
   * barOptions -- so a flag in a closure would be chart-agnostic, and the
   * second chart to scroll into view would arrive without a stagger.
   */
  it("tracks each chart separately", () => {
    const first = someChart();
    const second = someChart();
    finishUpdate(first, "default");

    expect(isEntering(first)).toBe(false);
    expect(isEntering(second)).toBe(true);
  });

  it("lets a chart arrive again after it is destroyed", () => {
    const chart = someChart();
    finishUpdate(chart, "default");
    barEntrancePlugin.afterDestroy?.(chart as never, undefined as never, undefined as never);

    expect(isEntering(chart)).toBe(true);
  });
});
