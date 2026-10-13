import type { Animation, Chart, Element, Plugin, Scale } from "chart.js";

import { canLabelColumns } from "@/core/lib/ui/chart-theme";

export interface ValueLabelOptions {
  /** Where the number sits relative to the bar's data end. */
  axis: "x" | "y";
  /** Appended to every number, e.g. " h". */
  suffix?: string;
  colour: string;
}

export interface PlacedLabel {
  text: string;
  x: number;
  y: number;
}

/** One bar, reduced to what deciding a label actually needs. */
export interface LabelCandidate {
  value: number | null;
  /** The bar's data end, in canvas pixels. */
  x: number;
  y: number;
}

/** How far off the bar's end the number sits. */
const GAP = 6;

/**
 * The number to print while the bar is still growing.
 *
 * The labels always travelled with the bars -- their position comes from the
 * live element -- but the text came straight from the data, so a bar twenty
 * percent of the way to 38 already printed "38". The movement then meant
 * nothing, and the screen was showing a figure that was not yet true.
 *
 * `reached` is that bar's end read back through its scale, so it climbs as the
 * bar does. `final` is the stored value, and it is what the resting frame must
 * print.
 *
 * Two things are load-bearing:
 *
 *   1. **Never more precision than the answer has.** The decimals come from
 *      `final`, so counts stay whole and hours stay at one place. Without it a
 *      bar on its way to 13.3 would flicker through 13.28714.
 *   2. **The last frame is exact**, and that is what the clamp is for. A pixel
 *      is not a value: converting back rounds, and a chart that settles on
 *      13.2 while its own tooltip and its export both say 13.3 is worse than
 *      one that never animated. A bar cannot overshoot its own length, so
 *      clamping towards zero removes the only direction the error can take it
 *      -- and at rest the bar's end *is* `final`'s pixel, so the clamp lands
 *      on the stored number rather than near it.
 *
 * Clamping rather than waiting for the animation to report itself finished:
 * that needs state per chart, and between the last animated frame and the
 * callback there is still a frame free to print the wrong number. Rather than
 * snapping inside a pixel's tolerance, too -- that tolerance differs with the
 * chart's height and its scale's range, so it is a tuned constant that would
 * go quietly wrong on the next chart somebody adds.
 */
export function labelValue(reached: number | undefined, final: number): number {
  // No scale, or a pixel outside it. Nothing to interpolate from, so the
  // answer is the answer. This is also the reduced-motion path in effect:
  // with `animation: false` the bar is at rest on the first frame.
  if (reached === undefined || !Number.isFinite(reached)) return final;

  const decimals = (String(final).split(".")[1] ?? "").length;
  const stepped = Number(reached.toFixed(decimals));

  // Growing down from zero is as legitimate as growing up, even though none
  // of the five charts does it today: counts and durations are never negative.
  // Written for both so it cannot silently invert if one ever is.
  return final < 0 ? Math.max(stepped, final) : Math.min(stepped, final);
}

/**
 * Which bars get a number, and where it goes.
 *
 * Split out from the plugin so the rule can be checked without a canvas: the
 * plugin below is the thin part, and this is the part with decisions in it.
 *
 * Nothing is drawn where the chart is too crowded for the numbers to be read —
 * `canLabelColumns` is the same rule the charts used before, derived from how
 * wide a three-digit number is against how much room a chart gets. Past that
 * the numbers collide and the chart is harder to read than it was without
 * them, and the tooltip carries the values instead.
 */
export function placeValueLabels(
  candidates: LabelCandidate[],
  options: { axis: "x" | "y"; suffix?: string; seriesPerGroup?: number }
): PlacedLabel[] {
  const groups = options.axis === "x" ? candidates.length / (options.seriesPerGroup ?? 1) : 0;

  // Horizontal bars run down the chart, so they never crowd sideways; only
  // columns have to earn the room.
  if (options.axis === "x" && !canLabelColumns(groups, options.seriesPerGroup ?? 1)) {
    return [];
  }

  return candidates
    .filter((candidate): candidate is LabelCandidate & { value: number } => candidate.value !== null)
    .map((candidate) => ({
      text: `${candidate.value}${options.suffix ?? ""}`,
      // A column is labelled above its top; a bar, just past its right end.
      x: options.axis === "x" ? candidate.x : candidate.x + GAP,
      y: options.axis === "x" ? candidate.y - GAP : candidate.y,
    }));
}

/**
 * What this bar currently reads, or undefined when there is nothing to read.
 *
 * Only while the bar's own animation is still running. The moment it is over,
 * the stored value is used instead -- and that is the guarantee, not an
 * optimisation. Pixel-to-value is an inverse with slack in it: it is exact
 * today only because nothing sets `alignToPixels` (half a device pixel of
 * error) or `minBarLength` (wrong by construction for every short bar), and
 * both are one-word edits somebody could reasonably make to this file. A chart
 * that settles on a number its own tooltip and its own export disagree with is
 * worse than a chart whose number does not move.
 *
 * Chart.js pins the element to its final value and clears `active()` in the
 * same two statements, and draws on that same frame -- so the first frame this
 * returns undefined is the first frame the bar is exactly where the data says.
 * There is no frame in between.
 *
 * This is also the reduced-motion path, for free: with `animation: false`
 * Chart.js never creates `$animations` at all, so the stored value prints from
 * the first frame with no branch for it.
 */
function reading(
  element: Element,
  scale: Scale | undefined,
  axis: "x" | "y" | null
): number | undefined {
  if (!scale || !axis) return undefined;

  // Typed as a total record, but it only exists once something is animating.
  const running: Animation | undefined = element.$animations?.[axis];
  if (!running?.active()) return undefined;

  return scale.getValueForPixel(element[axis]);
}

/**
 * Draws the numbers Chart.js does not draw itself.
 *
 * Written here rather than pulled in as chartjs-plugin-datalabels: the whole
 * need is one number per bar in one position, and the rule for when to skip
 * them already exists in this codebase.
 */
export function valueLabelPlugin(options: ValueLabelOptions): Plugin<"bar"> {
  return {
    id: `value-labels-${options.axis}-${options.suffix ?? ""}`,
    afterDatasetsDraw(chart: Chart<"bar">) {
      const { ctx } = chart;
      const seriesPerGroup = chart.data.datasets.length;

      const candidates: LabelCandidate[] = [];
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;

        /**
         * The scale the bar's length is measured on, taken from the dataset
         * rather than worked out from `options.axis`.
         *
         * `options.axis` names the axis the *label* is positioned against, so
         * deriving the value axis from it means writing the inversion a second
         * time, from a misleading name. `meta.vScale` is whichever scale this
         * dataset is actually plotted against, and `scale.axis` is exactly the
         * element property to read -- so the two cannot drift apart.
         */
        const scale = meta.vScale;
        const axis = scale?.axis === "x" || scale?.axis === "y" ? scale.axis : null;

        meta.data.forEach((element, index) => {
          const raw = dataset.data[index];
          candidates.push({
            value: typeof raw === "number" ? labelValue(reading(element, scale, axis), raw) : null,
            x: element.x,
            y: element.y,
          });
        });
      });

      const labels = placeValueLabels(candidates, {
        axis: options.axis,
        suffix: options.suffix,
        seriesPerGroup,
      });
      if (labels.length === 0) return;

      ctx.save();
      ctx.fillStyle = options.colour;
      ctx.font = "11px var(--font-sans, system-ui), system-ui, sans-serif";
      ctx.textAlign = options.axis === "x" ? "center" : "left";
      ctx.textBaseline = options.axis === "x" ? "bottom" : "middle";
      for (const label of labels) ctx.fillText(label.text, label.x, label.y);
      ctx.restore();
    },
  };
}
