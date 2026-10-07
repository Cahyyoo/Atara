import type { Plugin, UpdateMode } from "chart.js";

import { CHART_ANIMATION_MS } from "@/lib/chart-theme";

/**
 * When each bar sets off, so a chart arrives as a sequence rather than a blink.
 *
 * The sibling of row-stagger.ts, and deliberately not the same function. That
 * one caps the *index* at twelve and lets every later row share the last step,
 * which is right for a table: row thirteen is usually below the fold, so the
 * bunching is never seen. Every column of a chart is on screen at once, and
 * eighteen of them starting on the same frame would read as a rendering fault.
 * It is also in seconds, for the animation library, where Chart.js wants
 * milliseconds -- and a `* 1000` at the call site is the conversion that gets
 * inlined wrong later.
 *
 * So: same idea, same shape of constants, own file.
 */

/** Between one bar and the next, where there is room for the whole step. */
export const CHART_STAGGER_STEP_MS = 40;

/**
 * The longest any bar waits, whatever the bar count.
 *
 * Under CHART_ANIMATION_MS on purpose: the last bar sets off while the first
 * is still growing, which is what makes the five of them read as one gesture
 * instead of as a queue.
 */
export const CHART_STAGGER_TOTAL_MS = 240;

/**
 * How long one bar waits before it grows.
 *
 * The total is the budget and the step is what fits inside it. The five-bar
 * charts get the full 40ms and a crisp sequence; daily throughput over a month
 * is thirty-odd columns, and at a fixed step that would spend 1.2s just
 * reaching the last one -- longer than the growth itself, which reads as a slow
 * chart rather than an arriving one. Compressed instead, it degrades into a
 * quick left-to-right ripple: the shape survives, it just goes faster. Capping
 * the index the way rowDelay does would instead leave a visible wave followed
 * by a slab of bars all starting together, which is worse than no stagger.
 */
export function barStagger(index: number | undefined, count: number): number {
  if (index === undefined || !Number.isFinite(index) || index <= 0) return 0;
  if (!Number.isFinite(count) || count <= 1) return 0;

  const last = count - 1;
  const step = Math.min(CHART_STAGGER_STEP_MS, CHART_STAGGER_TOTAL_MS / last);
  // `total / last * last` can land an ulp over the total. A cap that is not a
  // cap by a hair is still not a cap, and the test holds it to the number.
  return Math.min(Math.min(index, last) * step, CHART_STAGGER_TOTAL_MS);
}

/**
 * Charts that have finished arriving.
 *
 * Keyed on the chart instance rather than held in a closure, because
 * `columnOptions` is shared by two charts and `barOptions` by three: a single
 * flag would be chart-agnostic, and the second chart to reveal would get no
 * stagger at all.
 */
const entered = new WeakSet<object>();

/** True until this chart has completed one full update -- i.e. during its reveal. */
export function isEntering(chart: object): boolean {
  return !entered.has(chart);
}

/**
 * Marks a chart as having arrived, so the stagger applies once.
 *
 * `afterUpdate` fires after the datasets have been updated, so the delays for
 * the arrival itself are already resolved by the time this runs.
 *
 * The mode is read defensively: Chart.js types the hook's `args.mode` as
 * UpdateMode, but react-chartjs-2 calls `chart.update()` with nothing and the
 * default to "default" happens later, down in DatasetController._update. The
 * hook really does see undefined.
 */
export const barEntrancePlugin: Plugin<"bar"> = {
  id: "bar-entrance",
  afterUpdate(chart, args: { mode?: UpdateMode }) {
    if (args.mode === undefined || args.mode === "default") {
      entered.add(chart);
    }
  },
  afterDestroy(chart) {
    entered.delete(chart);
  },
};

/**
 * Only the parts of Chart.js's scriptable context this reads.
 *
 * Structural rather than `ScriptableContext<"bar">`, following barGradient in
 * chart-theme.ts: the real context carries eight more fields, and a unit test
 * would have to invent all of them to ask this one question.
 */
export interface BarDelayContext {
  /** "data" for one bar, "dataset" for the shared options, "chart" for the root. */
  type: string;
  /** "default" | "resize" | "active" | "show" | "hide" -- and "attach", which the types do not list. */
  mode: string;
  dataIndex?: number;
  dataset: { data: unknown[] };
  chart: object;
}

/**
 * The delay Chart.js asks for, per bar, per update.
 *
 * Three guards, and every one of them is load-bearing:
 *
 *   `type === "data"` -- the same options also drive a dataset-level context
 *   (where dataIndex is undefined) and a chart-level one. Delaying the dataset
 *   pass would hold the scriptable gradient fill back; and the failure would be
 *   silent, because `barStagger(undefined, n)` is NaN and Chart.js absorbs a
 *   falsy delay to zero.
 *
 *   `mode === "default"` -- an allow-list, not a deny-list, because Chart.js
 *   passes mode strings its own UpdateMode type does not declare ("attach",
 *   from a resize before the canvas has width). The one that really breaks is
 *   "active": hover has a 400ms transition, so the delay is honoured, and
 *   sweeping the pointer across a chart would drag a trailing wave of
 *   highlights behind it.
 *
 *   `isEntering` -- the one no mode check can do. react-chartjs-2 updates with
 *   no mode for a data change, an options change and a label change alike, and
 *   Chart.js turns all of them into "default": **an arrival and a filter change
 *   are indistinguishable by mode.** And a delayed bar does not wait at its new
 *   length, it waits at its old one -- `Animation.tick` returns `from` while
 *   the delay runs. Since the printed number is derived from that geometry,
 *   staggering an update would leave part of the chart showing the previous
 *   filter's bars and the previous filter's figures for a fifth of a second
 *   after the filter changed. The same reason CountUp only counts on first
 *   paint: a refiltered dashboard moves to its new answer, it does not
 *   re-introduce itself.
 */
export function barEntranceDelay(context: BarDelayContext): number {
  if (context.type !== "data") return 0;
  if (context.mode !== "default") return 0;
  if (!isEntering(context.chart)) return 0;

  return barStagger(context.dataIndex, context.dataset.data.length);
}

/** The whole reveal, growth included. Read by the test that keeps it under a second. */
export const CHART_REVEAL_MS = CHART_ANIMATION_MS + CHART_STAGGER_TOTAL_MS;
