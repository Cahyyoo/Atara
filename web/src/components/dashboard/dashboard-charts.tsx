"use client";

import { Fragment, memo, useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { ChartCard, ChartLegend, ChartBox } from "@/components/dashboard/chart-kit";
import {
  BAR_BASE_EDGE,
  BAR_MAX_SIZE,
  BAR_RADIUS,
  CHART_ANIMATION_MS,
  GRID_DASH,
  SERIES,
  barGradient,
  categoricalColor,
  readChartChrome,
  type ChartChrome,
} from "@/lib/chart-theme";
import { valueLabelPlugin } from "@/lib/chart-value-labels";
import { barEntranceDelay, barEntrancePlugin } from "@/lib/chart-stagger";
import { UNPLACED_ID } from "@/lib/analytics";
import type { AnalyticsResult } from "@/lib/analytics";
import { stageLabel } from "@/lib/stages";
import { useTheme } from "@/components/layout/theme-provider";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { CHART_KEYS, chartRows, type ChartKey } from "@/lib/dashboard-layout";

// Only the pieces these charts use. Chart.js registers nothing by itself, and
// taking the whole library would carry line, pie and radar for no reason.
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

/**
 * "No place yet" is the absence of a place, not another one, so it gets the
 * neutral rather than a categorical hue — a hue here would read as a site that
 * does not exist.
 */
function colorFor(placeId: string, index: number, neutral: string): string {
  return placeId === UNPLACED_ID ? neutral : categoricalColor(index, neutral);
}

/** Shared by all five: one axis, recessive chrome, no canvas-drawn legend. */
export function baseOptions(
  chrome: ChartChrome,
  horizontal: boolean,
  reducedMotion: boolean
): ChartOptions<"bar"> {
  const value = {
    // Dashed and thin: a gridline is there to be measured against, not read.
    grid: { color: chrome.grid, drawTicks: false, lineWidth: 1 },
    // `dash` sits on `border`, not on `grid`. Chart.js still declares
    // `grid.borderDash` in its types but `_computeGridLineItems` reads
    // `border.setContext(...).dash`, so putting it on the grid typechecks and
    // then draws solid lines. `display: false` only drops the axis rule; the
    // gridlines still take their dash from here.
    border: { display: false, dash: [...GRID_DASH] },
    ticks: { color: chrome.axisText, font: { size: 11 }, precision: 0 },
  };
  const category = {
    grid: { display: false },
    border: { display: false },
    ticks: { color: chrome.axisText, font: { size: 11 } },
  };

  return {
    responsive: true,
    maintainAspectRatio: false,
    /**
     * Stated rather than inherited, and switched off when asked.
     *
     * Chart.js animates by default; leaving that implicit meant the duration
     * was a number nobody had chosen. It also meant the charts were the one
     * thing in the app that kept moving for somebody who had turned motion
     * down -- CSS cannot shorten what a script paints into a canvas, so the
     * media query the rest of the app relies on never reached here.
     *
     * Zero rather than a near-zero duration: the CSS side uses 0.01ms because
     * a zeroed CSS animation never fires animationend and things wait on
     * that. A canvas has no such event, so there is nothing to keep alive.
     */
    animation: reducedMotion
      ? false
      : {
          duration: CHART_ANIMATION_MS,
          easing: "easeOutQuart",
          /**
           * Bars set off one after another rather than all at once.
           *
           * Everything growing together is a single blink: it is motion, but
           * there is nothing in it to follow. A short stagger gives the eye an
           * order to read the chart in.
           *
           * The guards live in barEntranceDelay, and they are the whole
           * difference between this reading as arrival and reading as lag --
           * see that function for what each one is holding back.
           *
           * Keyed on dataIndex and nothing else, so a day's registered and
           * completed columns move as one: the category axis carries order,
           * the series axis carries identity, and staggering identity reads as
           * shimmer rather than as sequence.
           */
          delay: barEntranceDelay,
        },
    // Room for the numbers drawn just past each bar's end.
    layout: { padding: horizontal ? { right: 40 } : { top: 20 } },
    plugins: {
      // The legend is React DOM above the chart, so the canvas never draws one.
      legend: { display: false },
      // A soft sheet rather than a bordered box. A canvas cannot blur what is
      // behind it the way iOS does, so the softness has to come from the radius
      // and the padding, and the hairline goes because it is what makes a
      // rounded rectangle read as a window instead of a card.
      tooltip: {
        backgroundColor: chrome.popover,
        titleColor: chrome.popoverText,
        bodyColor: chrome.popoverText,
        borderWidth: 0,
        padding: 14,
        cornerRadius: 14,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
      },
    },
    scales: horizontal ? { x: value, y: category } : { x: category, y: value },
  };
}

/**
 * The five charts, split out for two reasons.
 *
 * The chart library is by far the heaviest thing the dashboard loads, so
 * keeping it in its own chunk lets the KPIs, the filters and the
 * needs-attention table arrive without waiting for it.
 *
 * And memoised on `data`: these chart containers used to re-render on every
 * keystroke in a date box and on every toggle of the table below them,
 * because they sat inside the same component as that state.
 */
export const DashboardCharts = memo(function DashboardCharts({
  data,
  charts = CHART_KEYS,
}: {
  data: AnalyticsResult;
  /** Which charts, in order. See dashboard-layout.ts. */
  charts?: readonly ChartKey[];
}) {
  const t = useTranslations("dashboard");
  const tStages = useTranslations("stages");

  /**
   * Re-read whenever the theme changes. A canvas cannot take `var(--border)`,
   * so the tokens are resolved to real colours here — which means the values
   * are a snapshot, and a snapshot taken under the light theme would keep
   * painting light axes and gridlines on a dark card. The theme comes from the
   * server through context, so switching it re-runs this.
   */
  const theme = useTheme();
  const chrome = useMemo(() => readChartChrome(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const columnOptions = useMemo(
    () => baseOptions(chrome, false, reducedMotion),
    [chrome, reducedMotion]
  );
  const barOptions = useMemo<ChartOptions<"bar">>(
    () => ({ ...baseOptions(chrome, true, reducedMotion), indexAxis: "y" }),
    [chrome, reducedMotion]
  );
  const labels = useMemo(
    () => ({
      column: valueLabelPlugin({ axis: "x", colour: chrome.axisText }),
      bar: valueLabelPlugin({ axis: "y", colour: chrome.axisText }),
      hours: valueLabelPlugin({ axis: "y", suffix: " h", colour: chrome.axisText }),
    }),
    [chrome]
  );

  // The axis reads from `code`, which is "—" for the unplaced group. Naming it
  // here rather than in analytics keeps the wording out of the server.
  const placeData = data.placeSplit.map((entry) =>
    entry.placeId === UNPLACED_ID ? { ...entry, code: t("codeSplit.unplaced") } : entry
  );

  /** One bar's look, so the five charts cannot drift apart on it. */
  const bar = (fill: string | ReturnType<typeof barGradient>) => ({
    backgroundColor: fill,
    borderRadius: BAR_RADIUS,
    borderSkipped: BAR_BASE_EDGE,
    maxBarThickness: BAR_MAX_SIZE,
  });

  /**
   * The lit fill, for the three charts that draw one series.
   *
   * Two of the five keep a flat fill and that is not an oversight: in the
   * throughput chart colour separates registered from completed, and in the
   * place split it names the site. A gradient inside a mark whose colour is an
   * identity reads as two identities.
   */
  const litColumn = barGradient(false);
  const litBar = barGradient(true);

  /**
   * Every chart, built once, keyed so a role's layout can pick and order them
   * (dashboard-layout.ts). Building one that is not shown costs an object, not
   * a canvas: nothing mounts until it is rendered below.
   */
  const cards: Record<ChartKey, ReactNode> = {
    throughput: (
      <ChartCard
        title={t("throughput.title")}
        description={t("throughput.description")}
        legend={
          <ChartLegend
            items={[
              { label: t("throughput.registered"), color: SERIES.primary },
              { label: t("throughput.completed"), color: SERIES.secondary },
            ]}
          />
        }
        isEmpty={data.throughput.length === 0}
      >
        <ChartBox className="h-[260px]">
          <Bar
            options={columnOptions}
            plugins={[labels.column, barEntrancePlugin]}
            data={{
              labels: data.throughput.map((entry) => entry.shiftDate),
              datasets: [
                {
                  label: t("throughput.registered"),
                  data: data.throughput.map((entry) => entry.created),
                  ...bar(SERIES.primary),
                },
                {
                  label: t("throughput.completed"),
                  data: data.throughput.map((entry) => entry.completed),
                  ...bar(SERIES.secondary),
                },
              ],
            }}
          />
        </ChartBox>
      </ChartCard>
    ),
    stageHours: (
      <ChartCard
        title={t("stageHours.title")}
        description={t("stageHours.description")}
        isEmpty={data.stageDurations.every((stage) => stage.averageHours === 0)}
      >
        <ChartBox className="h-[260px]">
          <Bar
            options={barOptions}
            plugins={[labels.hours, barEntrancePlugin]}
            data={{
              labels: data.stageDurations.map((stage) =>
                stageLabel(tStages, stage.stageKey, stage.stageName)
              ),
              datasets: [
                {
                  label: "Average",
                  data: data.stageDurations.map((stage) => stage.averageHours),
                  ...bar(litBar),
                },
              ],
            }}
          />
        </ChartBox>
      </ChartCard>
    ),
    waiting: (
      <ChartCard
        title={t("waiting.title")}
        description={t("waiting.description")}
        isEmpty={data.bottleneck.every((stage) => stage.count === 0)}
      >
        <ChartBox className="h-[260px]">
          <Bar
            options={barOptions}
            plugins={[labels.bar, barEntrancePlugin]}
            data={{
              labels: data.bottleneck.map((stage) =>
                stageLabel(tStages, stage.stageKey, stage.stageName)
              ),
              datasets: [
                {
                  label: "Samples",
                  data: data.bottleneck.map((stage) => stage.count),
                  ...bar(litBar),
                },
              ],
            }}
          />
        </ChartBox>
      </ChartCard>
    ),
    niDistribution: (
      <ChartCard
        title={t("niDistribution.title")}
        description={t("niDistribution.description")}
        isEmpty={data.niDistribution.length === 0}
        emptyMessage={t("niDistribution.empty")}
      >
        <ChartBox className="h-[240px]">
          <Bar
            options={columnOptions}
            plugins={[labels.column, barEntrancePlugin]}
            data={{
              labels: data.niDistribution.map((entry) => entry.bucket),
              datasets: [
                {
                  label: "Samples",
                  data: data.niDistribution.map((entry) => entry.count),
                  ...bar(litColumn),
                },
              ],
            }}
          />
        </ChartBox>
      </ChartCard>
    ),
    placeSplit: (
      <ChartCard
        title={t("codeSplit.title")}
        description={t("codeSplit.description")}
        isEmpty={data.placeSplit.every((entry) => entry.count === 0)}
        legend={
          <ChartLegend
            items={placeData.map((entry, index) => ({
              label: entry.code,
              color: colorFor(entry.placeId, index, chrome.neutral),
            }))}
          />
        }
      >
        <ChartBox className="h-[240px]">
          <Bar
            options={barOptions}
            plugins={[labels.bar, barEntrancePlugin]}
            data={{
              labels: placeData.map((entry) => entry.code),
              datasets: [
                {
                  label: "Samples",
                  data: placeData.map((entry) => entry.count),
                  ...bar(SERIES.primary),
                  // Coloured by the place's own position in the master list,
                  // not by its rank here: a filter that drops one place must
                  // not repaint the others.
                  backgroundColor: placeData.map((entry, index) =>
                    colorFor(entry.placeId, index, chrome.neutral)
                  ),
                },
              ],
            }}
          />
        </ChartBox>
      </ChartCard>
    ),
  };

  return (
    <>
      {chartRows(charts).map((row) =>
        typeof row === "string" ? (
          <Fragment key={row}>{cards[row]}</Fragment>
        ) : (
          <div
            key={row.join("|")}
            // A lone chart takes the row rather than half of it.
            className={cn("grid grid-cols-1 gap-4", row.length > 1 && "xl:grid-cols-2")}
          >
            {row.map((key) => (
              <Fragment key={key}>{cards[key]}</Fragment>
            ))}
          </div>
        )
      )}
    </>
  );
});
