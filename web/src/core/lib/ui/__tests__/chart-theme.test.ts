import { describe, expect, it } from "vitest";
import {
  barGradient,
  canLabelColumns,
  categoricalColor,
  readChartChrome,
  SERIES,
  SERIES_GRADIENT,
} from "@/core/lib/ui/chart-theme";

/** Stands in for whatever readChartChrome resolves --muted-foreground to. */
const NEUTRAL = "#737373";

describe("canLabelColumns", () => {
  // The dashboard's default window, which is the case that has to work.
  it("labels a fortnight of throughput, two series and all", () => {
    expect(canLabelColumns(14, 2)).toBe(true);
  });

  it("gives up once a wide range would make the numbers collide", () => {
    // Three months of two series is 180 labels across about 1000px.
    expect(canLabelColumns(90, 2)).toBe(false);
  });

  it("allows a single series roughly twice as many points", () => {
    expect(canLabelColumns(30)).toBe(true);
    expect(canLabelColumns(30, 2)).toBe(false);
  });

  it("draws nothing for an empty chart rather than an empty label row", () => {
    expect(canLabelColumns(0)).toBe(false);
    expect(canLabelColumns(0, 2)).toBe(false);
  });
});

describe("categoricalColor", () => {
  it("hands out the hues in a fixed order, so a filter cannot repaint a series", () => {
    expect(categoricalColor(0, NEUTRAL)).toBe(categoricalColor(0, NEUTRAL));
    expect(categoricalColor(0, NEUTRAL)).not.toBe(categoricalColor(1, NEUTRAL));
  });

  it("falls back to the neutral rather than inventing a hue past the ramp", () => {
    expect(categoricalColor(99, NEUTRAL)).toBe(NEUTRAL);
  });

  /**
   * The regression this argument exists for. The overflow used to be the
   * literal string "var(--muted-foreground)", which Chart.js passes to
   * ctx.fillStyle; an unparseable fillStyle is a no-op per spec, so the bar
   * kept whatever colour was set before it. Nothing a canvas is painted with
   * may be a CSS variable.
   */
  it("never returns a CSS variable, which a canvas cannot paint with", () => {
    for (let index = 0; index < 10; index += 1) {
      expect(categoricalColor(index, NEUTRAL)).not.toContain("var(");
    }
  });
});

describe("readChartChrome", () => {
  it("falls back to real colours off the document, never to CSS variables", () => {
    // Server-side, where there is no document to read tokens from.
    for (const theme of ["light", "dark"] as const) {
      for (const value of Object.values(readChartChrome(theme))) {
        expect(value).not.toContain("var(");
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  /**
   * There is a dark theme now, and a canvas holds whatever colour it was given.
   * A single light-only fallback would paint a light grid and near-black
   * tooltip text onto a dark card on any render before getComputedStyle runs.
   */
  it("gives the dark theme its own fallback, not the light one", () => {
    const light = readChartChrome("light");
    const dark = readChartChrome("dark");

    for (const key of Object.keys(light) as (keyof typeof light)[]) {
      expect(dark[key]).not.toBe(light[key]);
    }
  });

  it("keeps the light fallback as the default, which is the app's default theme", () => {
    expect(readChartChrome()).toEqual(readChartChrome("light"));
  });
});

describe("barGradient", () => {
  /** Enough of a canvas context to record what the gradient was built from. */
  function fakeChart(area?: { left: number; right: number; top: number; bottom: number }) {
    const stops: [number, string][] = [];
    const calls: number[][] = [];
    return {
      stops,
      calls,
      chart: {
        chartArea: area,
        ctx: {
          createLinearGradient(...args: number[]) {
            calls.push(args);
            return {
              addColorStop: (offset: number, color: string) => {
                stops.push([offset, color]);
              },
            } as unknown as CanvasGradient;
          },
        } as unknown as CanvasRenderingContext2D,
      },
    };
  }

  const AREA = { left: 40, right: 400, top: 10, bottom: 260 };

  it("returns a flat colour before the first layout, rather than throwing", () => {
    const fake = fakeChart(undefined);
    expect(barGradient(false)(fake)).toBe(SERIES.primary);
    expect(fake.calls).toHaveLength(0);
  });

  it("runs a column's gradient up the plot, dark at the baseline", () => {
    const fake = fakeChart(AREA);
    barGradient(false)(fake);
    // Bottom to top: the axis end is first, so it takes the base colour.
    expect(fake.calls[0]).toEqual([0, AREA.bottom, 0, AREA.top]);
    expect(fake.stops).toEqual([
      [0, SERIES_GRADIENT.base],
      [1, SERIES_GRADIENT.tip],
    ]);
  });

  it("runs a horizontal bar's gradient left to right, dark at the baseline", () => {
    const fake = fakeChart(AREA);
    barGradient(true)(fake);
    expect(fake.calls[0]).toEqual([AREA.left, 0, AREA.right, 0]);
    expect(fake.stops).toEqual([
      [0, SERIES_GRADIENT.base],
      [1, SERIES_GRADIENT.tip],
    ]);
  });
});
