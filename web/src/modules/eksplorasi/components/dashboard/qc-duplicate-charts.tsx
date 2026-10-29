"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartDataset,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import { Scatter } from "react-chartjs-2";
import { SERIES, readChartChrome, type ChartChrome } from "@/core/lib/ui/chart-theme";
import { useTheme } from "@/core/components/layout/theme-provider";
import { useReducedMotion } from "@/core/lib/ui/use-reduced-motion";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import {
  DUPLICATE_TOLERANCE,
  isOutsideTolerance,
  linearFit,
  pairRange,
  relativeDifference,
  rpdSeries,
  isRpdFlagged,
  isRpdWithin,
} from "@/modules/eksplorasi/lib/qc-duplicate";
import {
  ChartCard,
  ChartLegend,
  POINT,
  STATUS,
  TOLERANCE_LINE,
  axis,
  baseOptions,
  referenceLine,
  type LinePoint,
} from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";
import { RpdDistributionChart, RpdGraphChart } from "@/modules/eksplorasi/components/dashboard/qc-rpd-charts";
import type { DuplicatePair, QcDuplicate } from "@/modules/eksplorasi/types";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

/** The trend line: the fit through the readings, in the series colour, solid -- set apart from the dashed band. */
const TREND_COLOR = SERIES.primary;

/** A straight line y = slope·x + intercept, across the axis range. */
const across = (slope: number, intercept: number, min: number, max: number): LinePoint[] => [
  { x: min, y: slope * min + intercept },
  { x: max, y: slope * max + intercept },
];

function DuplicateChart({
  element,
  pairs,
  chrome,
  reducedMotion,
}: {
  element: string;
  pairs: DuplicatePair[];
  chrome: ChartChrome;
  reducedMotion: boolean;
}) {
  const t = useTranslations("qcDashboard.duplicate");
  const format = useFormatter();
  // The readings in the card's ink, as on the control charts: colour belongs to the lines.
  const ink = chrome.popoverText;

  const { datasets, options } = useMemo(() => {
    const range = pairRange(pairs) ?? { min: 0, max: 1 };
    const fit = linearFit(pairs);
    const n = (value: number) => format.number(value, { maximumFractionDigits: 4 });

    const readings: ChartDataset<"scatter", (DuplicatePair | LinePoint)[]> = {
      label: t("readings"),
      data: pairs,
      // One colour per point, in the pairs' order.
      backgroundColor: pairs.map((pair) => (isOutsideTolerance(pair) ? STATUS.critical : ink)),
      borderColor: chrome.surface,
      ...POINT,
    };
    const lines = [
      referenceLine<DuplicatePair>(t("plus10"), across(1 + DUPLICATE_TOLERANCE, 0, range.min, range.max), TOLERANCE_LINE.color, TOLERANCE_LINE.dash),
      referenceLine<DuplicatePair>(t("minus10"), across(1 - DUPLICATE_TOLERANCE, 0, range.min, range.max), TOLERANCE_LINE.color, TOLERANCE_LINE.dash),
      ...(fit ? [referenceLine<DuplicatePair>(t("trend", { r2: n(fit.r2) }), across(fit.slope, fit.intercept, range.min, range.max), TREND_COLOR, [])] : []),
    ];

    const options: ChartOptions<"scatter"> = {
      ...baseOptions(chrome, reducedMotion),
      // Both axes over the same range, so the band and the diagonal read true.
      scales: {
        x: { ...axis(chrome, t("axisX", { element })), ...range },
        y: { ...axis(chrome, t("axisY", { element })), ...range },
      },
    };
    options.plugins!.tooltip = {
      ...options.plugins!.tooltip,
      // The lines are references, not readings.
      filter: (item: TooltipItem<"scatter">) => item.datasetIndex === 0,
      callbacks: {
        title: (items: TooltipItem<"scatter">[]) => (items[0]?.raw as DuplicatePair | undefined)?.sampleId ?? "",
        label: (item: TooltipItem<"scatter">) => {
          const pair = item.raw as DuplicatePair;
          const difference = relativeDifference(pair) * 100;
          return t("point", {
            originalId: pair.originalId,
            x: n(pair.x),
            y: n(pair.y),
            difference: Number.isFinite(difference)
              ? format.number(difference, { maximumFractionDigits: 1, signDisplay: "exceptZero" })
              : "—",
          });
        },
      },
    };
    return { datasets: [readings, ...lines], options };
  }, [pairs, chrome, reducedMotion, ink, element, t, format]);

  return <Scatter data={{ datasets }} options={options} aria-label={`${t("readings")} · ${element}`} role="img" />;
}

/**
 * The duplicate charts: for each element shown (`elements`), three cards in
 * a column -- the duplicate (Y) against its original (X) with the ±10% lines
 * and the trend line with its equation and R², each pair's RPD in the order
 * the duplicates were taken, and the RPD distribution. Two elements side by
 * side line their cards up row by row, as the lab's QC workbook does.
 */
export function QcDuplicateCharts({ data, elements }: { data: QcDuplicate; elements: readonly ControlElement[] }) {
  const theme = useTheme();
  const chrome = useMemo(() => readChartChrome(theme), [theme]);
  const reducedMotion = useReducedMotion();

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {data.elements
        .filter(({ element }) => elements.includes(element))
        .map((entry) => (
          <ElementCards key={entry.element} {...entry} chrome={chrome} reducedMotion={reducedMotion} />
        ))}
    </div>
  );
}

function ElementCards({
  element: field,
  pairs,
  skipped,
  chrome,
  reducedMotion,
}: QcDuplicate["elements"][number] & { chrome: ChartChrome; reducedMotion: boolean }) {
  const t = useTranslations("qcDashboard.duplicate");
  const format = useFormatter();
  const element = ELEMENT_LABELS[field];
  const ink = chrome.popoverText;
  const n = (value: number) => format.number(value, { maximumFractionDigits: 4 });
  const share = (count: number, of: number) => format.number(of === 0 ? 0 : (count / of) * 100, { maximumFractionDigits: 1 });

  const fit = useMemo(() => linearFit(pairs), [pairs]);
  const rpds = useMemo(() => rpdSeries(pairs), [pairs]);
  const outside = pairs.filter(isOutsideTolerance).length;
  const flagged = rpds.filter(isRpdFlagged).length;
  const within = rpds.filter(isRpdWithin).length;
  const empty = pairs.length === 0;
  // The whole story once, on the first card; the RPD cards only say they have nothing.
  const emptyMessage = empty ? t("empty", { element }) : null;
  const rpdEmptyMessage = empty ? t("rpdEmpty", { element }) : null;
  const rpdLegend = { label: t("rpdSeries", { element }), color: ink };

  return (
    // Its own column on a phone; at two columns, three rows of the grid shared with the element beside it.
    <div className="grid gap-6 xl:row-span-3 xl:grid-rows-subgrid">
      <ChartCard
        title={element}
        description={
          fit
            ? t("fit", {
                pairs: t("pairs", { count: pairs.length }),
                slope: n(fit.slope),
                intercept: `${fit.intercept < 0 ? "−" : "+"} ${n(Math.abs(fit.intercept))}`,
                r2: n(fit.r2),
              })
            : t("pairs", { count: pairs.length })
        }
        legend={
          empty ? null : (
            <ChartLegend
              items={[
                { label: t("readings"), color: ink },
                { label: t("outsideLegend"), color: STATUS.critical },
                { label: t("band"), color: TOLERANCE_LINE.color, line: true, dash: "dashed" },
                ...(fit ? [{ label: t("trend", { r2: n(fit.r2) }), color: TREND_COLOR, line: true }] : []),
              ]}
            />
          )
        }
        notes={[
          ...(skipped > 0 ? [t("skipped", { count: skipped })] : []),
          ...(outside > 0 ? [t("outside", { count: outside })] : []),
          ...(!empty && !fit ? [t("noFit")] : []),
        ]}
        emptyMessage={emptyMessage}
      >
        <DuplicateChart element={element} pairs={pairs} chrome={chrome} reducedMotion={reducedMotion} />
      </ChartCard>

      <ChartCard
        title={t("rpdGraphTitle", { element })}
        description={t("rpdGraphDescription", { count: rpds.length })}
        legend={
          empty ? null : (
            <ChartLegend
              items={[
                rpdLegend,
                { label: t("rpdFlagged"), color: STATUS.critical },
                { label: t("rpdFlag"), color: STATUS.critical, line: true, dash: "dotted" },
              ]}
            />
          )
        }
        notes={[
          ...(flagged > 0 ? [t("rpdFlaggedCount", { count: flagged })] : []),
          ...(rpds.length < pairs.length ? [t("rpdSkipped", { count: pairs.length - rpds.length })] : []),
        ]}
        emptyMessage={rpdEmptyMessage}
      >
        <RpdGraphChart element={element} points={rpds} chrome={chrome} reducedMotion={reducedMotion} />
      </ChartCard>

      <ChartCard
        title={t("rpdDistributionTitle", { element })}
        description={t("rpdWithin", { within: share(within, rpds.length), over: share(rpds.length - within, rpds.length) })}
        legend={
          empty ? null : (
            <ChartLegend items={[rpdLegend, { label: t("rpdLimit"), color: TOLERANCE_LINE.color, line: true, dash: "dashed" }]} />
          )
        }
        notes={[]}
        emptyMessage={rpdEmptyMessage}
      >
        <RpdDistributionChart element={element} points={rpds} chrome={chrome} reducedMotion={reducedMotion} />
      </ChartCard>
    </div>
  );
}
