/**
 * Chart palette.
 *
 * These two steps were checked with the dataviz validator against both the light
 * (#fcfcfb) and dark (#1a1a19) chart surfaces: lightness band, chroma floor, CVD
 * separation (ΔE 13.1 protan / 25.7 tritan), normal-vision separation (ΔE 21.7)
 * and 3:1 contrast all pass in both modes, so one pair serves both themes.
 *
 * Single-series charts use SERIES.primary only — magnitude is carried by bar
 * length, never by hue.
 */
import type { Theme } from "@/core/lib/ui/theme";

export const SERIES = {
  primary: "#0d9488",
  secondary: "#c2700c",
} as const;

/**
 * Hues for a chart whose categories come from master data, assigned in this
 * fixed order and never cycled — a series keeps its colour when a filter
 * removes another, so the eye can carry a place across two charts.
 *
 * Checked against both chart surfaces: every step clears the lightness band,
 * the chroma floor and 3:1 contrast, and the closest adjacent pair is ΔE 21.7
 * to normal vision and 13.1 under protanopia. Tritan sits at 7.1, which is why
 * the bars that use these are also named on their axis and carry their own
 * value — colour is never the only thing telling them apart.
 */
export const CATEGORICAL = [
  "#0d9488",
  "#c2700c",
  "#6366f1",
  "#db2777",
  "#0284c7",
  "#65a30d",
] as const;

/**
 * Past the ramp, a neutral: an invented hue would read as a meaning it lacks.
 *
 * Taken as an argument rather than read from a constant, and that is a fix
 * rather than a style. It used to be the string "var(--muted-foreground)",
 * handed straight to Chart.js and from there to `ctx.fillStyle`. Setting
 * fillStyle to something the engine cannot parse is a no-op per spec: it keeps
 * whatever colour was set last. So the "no place yet" bar was not neutral, it
 * was whichever colour happened to precede it. The legend swatch looked right
 * the whole time, because that is a DOM element and the browser resolves the
 * variable there.
 *
 * The resolved value comes from `readChartChrome().neutral`, which also means
 * it follows a theme change instead of being frozen at first paint.
 */
export function categoricalColor(index: number, neutral: string): string {
  return CATEGORICAL[index] ?? neutral;
}

export interface ChartChrome {
  grid: string;
  axisText: string;
  surface: string;
  popover: string;
  popoverText: string;
  /** For a mark that stands for an absence rather than a category. */
  neutral: string;
}

/**
 * What the tokens fall back to before the document can be read.
 *
 * One set per theme, because there is a dark theme now. A single light-only
 * fallback would paint light gridlines and near-black tooltip text on a dark
 * card for any render that happens before `getComputedStyle` can be called.
 *
 * The dark border is `oklch(1 0 0 / 10%)`, which is translucent; a canvas
 * needs one flat colour, so it is flattened over the dark card here.
 */
const CHROME_FALLBACK: Record<Theme, ChartChrome> = {
  light: {
    grid: "#e5e5e5",
    axisText: "#737373",
    surface: "#ffffff",
    popover: "#ffffff",
    popoverText: "#0a0a0a",
    neutral: "#737373",
  },
  dark: {
    grid: "#2e2e2e",
    axisText: "#a1a1a1",
    surface: "#171717",
    popover: "#171717",
    popoverText: "#fafafa",
    neutral: "#a1a1a1",
  },
};

/**
 * Recessive chrome, read from the app's own tokens.
 *
 * Resolved to real colours rather than handed over as `var(--border)`. Recharts
 * drew SVG, so the browser resolved the variables itself; Chart.js draws to a
 * canvas, and `fillStyle` cannot take a custom property — it would silently
 * paint nothing.
 *
 * This used to say "read once, and if a theme toggle is ever added this is the
 * function that has to be re-run". There is a theme toggle now, so it is
 * re-run: the caller keys its memo on the theme, and the tokens are re-read
 * against whichever one is on the document.
 */
export function readChartChrome(theme: Theme = "light"): ChartChrome {
  const fallback = CHROME_FALLBACK[theme];
  if (typeof window === "undefined") return fallback;

  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, defaultValue: string) =>
    styles.getPropertyValue(name).trim() || defaultValue;

  return {
    grid: token("--border", fallback.grid),
    axisText: token("--muted-foreground", fallback.axisText),
    surface: token("--card", fallback.surface),
    popover: token("--popover", fallback.popover),
    popoverText: token("--popover-foreground", fallback.popoverText),
    neutral: token("--muted-foreground", fallback.neutral),
  };
}

/** Widest a bar may be drawn, so a three-bar chart is not three slabs. */
export const BAR_MAX_SIZE = 24;
/**
 * Rounded at the data end, square at the baseline.
 *
 * The rounding is the iOS part; the baseline staying square is what keeps the
 * chart honest. A bar rounded at both ends floats off its axis, and the corner
 * it loses there is read as length that is not in the data — worst on the
 * shortest bars, which have the least length to lose.
 */
export const BAR_RADIUS = 8;
/** Which edge keeps its corners: the one sitting on the baseline. */
export const BAR_BASE_EDGE = "start" as const;

/** Gridlines belong to the background, so they are drawn as one. */
export const GRID_DASH = [4, 4] as const;

/**
 * The two ends of the single-series bar fill.
 *
 * Both measured against the surfaces a bar is actually drawn on — 3:1 is the
 * floor for a mark, and one fill serves both themes:
 *
 *   #0b7a70  baseline   5.21:1 on white card · 3.44:1 on the dark card
 *   #11a396  data end   3.13:1 on white card · 5.72:1 on the dark card
 *
 * That window is narrow and it is not an accident: a step lighter than #11a396
 * reads 2.89:1 on white and a step darker than #0b7a70 reads 2.97:1 on the dark
 * card. SERIES.primary sits between the two, so the gradient reads as the same
 * teal lit from the data end rather than as a second colour.
 */
export const SERIES_GRADIENT = { base: "#0b7a70", tip: "#11a396" } as const;

/**
 * A gradient fill for charts carrying ONE series.
 *
 * Anchored to the chart area, never to the individual bar. Per-bar anchoring
 * would give every bar the same light-to-dark sweep over its own length, so two
 * equal values would look equal only by luck of where they sat — the fill would
 * be encoding position. Anchored to the plot, a given value always paints the
 * same, and the wash is monotone with bar length, which is the one thing the
 * chart already says.
 *
 * Only for single-series charts. Where colour carries identity — the two-series
 * throughput chart, the per-place split — the fill stays flat, because a shift
 * within one mark is read as a difference between marks.
 */
export function barGradient(horizontal: boolean) {
  return ({ chart }: { chart: { ctx: CanvasRenderingContext2D; chartArea?: ChartArea } }) => {
    const { ctx, chartArea } = chart;
    // Undefined until the first layout pass. Chart.js resolves this again on
    // the pass that follows, so the flat colour shows for one frame at most.
    if (!chartArea) return SERIES.primary;

    const gradient = horizontal
      ? ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
      : ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    gradient.addColorStop(0, SERIES_GRADIENT.base);
    gradient.addColorStop(1, SERIES_GRADIENT.tip);
    return gradient;
  };
}

/** Only the corners of the plot are needed, so Chart.js is not imported for it. */
interface ChartArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Whether a column chart still has room to print a number over every bar.
 *
 * Derived rather than guessed. A three-digit number at 11px needs roughly
 * LABEL_WIDTH including its gap, the charts get about CHART_WIDTH, and a grouped
 * chart splits that between its series. Past the limit the numbers collide and
 * the chart becomes harder to read than it was without them, so they are dropped
 * and the tooltip carries the values instead.
 */
const LABEL_WIDTH = 28;
const CHART_WIDTH = 1000;

export function canLabelColumns(points: number, seriesPerGroup = 1): boolean {
  if (points === 0) return false;
  return points * seriesPerGroup * LABEL_WIDTH <= CHART_WIDTH;
}

/**
 * How long a chart takes to draw itself in.
 *
 * Chart.js defaults to 1000ms. Written down rather than inherited, because a
 * number that is never stated is a number nobody can decide about. All five
 * charts run it together as the dashboard opens (see ChartBox in
 * chart-kit.tsx).
 *
 * 700 rather than 1000: the bars reach their length while the eye is still
 * arriving at the card, which is the point. Longer and the reader is waiting
 * for a number they can already see the shape of.
 */
export const CHART_ANIMATION_MS = 700;
