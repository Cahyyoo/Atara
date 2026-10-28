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
import { readChartChrome, type ChartChrome } from "@/core/lib/ui/chart-theme";
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
} from "@/modules/eksplorasi/lib/qc-duplicate";
import {
  ChartCard,
  ChartLegend,
  POINT,
  STATUS,
  axis,
  baseOptions,
} from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";
import type { DuplicatePair, QcDuplicate } from "@/modules/eksplorasi/types";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

/** The ±10% lines: one tolerance, so one colour and one pattern for both. */
const BAND = { color: STATUS.warning, dash: [6, 4] };
/** The trend line: a reference, not a threshold, so the neutral ink, dotted. */
const TREND_DASH = [2, 3];

type Line = { x: number; y: number };

/** A straight line y = slope·x + intercept, across the axis range. */
const across = (slope: number, intercept: number, min: number, max: number): Line[] => [
  { x: min, y: slope * min + intercept },
  { x: max, y: slope * max + intercept },
];

/** A reference line's dataset: no points, no tooltip. */
const referenceLine = (label: string, data: Line[], color: string, dash: number[]): ChartDataset<"scatter", (DuplicatePair | Line)[]> => ({
  label,
  data,
  showLine: true,
  borderColor: color,
  borderWidth: 2,
  borderDash: dash,
  pointRadius: 0,
  pointHoverRadius: 0,
});

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

    const readings: ChartDataset<"scatter", (DuplicatePair | Line)[]> = {
      label: t("readings"),
      data: pairs,
      // One colour per point, in the pairs' order.
      backgroundColor: pairs.map((pair) => (isOutsideTolerance(pair) ? STATUS.critical : ink)),
      borderColor: chrome.surface,
      ...POINT,
    };
    const lines = [
      referenceLine(t("plus10"), across(1 + DUPLICATE_TOLERANCE, 0, range.min, range.max), BAND.color, BAND.dash),
      referenceLine(t("minus10"), across(1 - DUPLICATE_TOLERANCE, 0, range.min, range.max), BAND.color, BAND.dash),
      ...(fit ? [referenceLine(t("trend", { r2: n(fit.r2) }), across(fit.slope, fit.intercept, range.min, range.max), chrome.neutral, TREND_DASH)] : []),
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
 * The duplicate charts: a card per element shown (`elements`), each
 * duplicate (Y) against its original (X), the ±10% lines about the
 * diagonal, and the straight line through the pairs with its R². A pair past
 * ±10% is drawn in the critical colour and counted under the chart.
 */
export function QcDuplicateCharts({ data, elements }: { data: QcDuplicate; elements: readonly ControlElement[] }) {
  const t = useTranslations("qcDashboard.duplicate");
  const format = useFormatter();
  const theme = useTheme();
  const chrome = useMemo(() => readChartChrome(theme), [theme]);
  const reducedMotion = useReducedMotion();

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {data.elements
        .filter(({ element }) => elements.includes(element))
        .map(({ element: field, pairs, skipped }) => {
          const element = ELEMENT_LABELS[field];
          const fit = linearFit(pairs);
          const outside = pairs.filter(isOutsideTolerance).length;
          const notes = [
            ...(skipped > 0 ? [t("skipped", { count: skipped })] : []),
            ...(outside > 0 ? [t("outside", { count: outside })] : []),
          ];
          const empty = pairs.length === 0;
          return (
            <ChartCard
              key={field}
              title={element}
              description={t("pairs", { count: pairs.length })}
              legend={
                empty ? null : (
                  <ChartLegend
                    items={[
                      { label: t("readings"), color: chrome.popoverText },
                      { label: t("band"), color: BAND.color, line: true, dash: "dashed" },
                      ...(fit
                        ? [
                            {
                              label: t("trend", { r2: format.number(fit.r2, { maximumFractionDigits: 4 }) }),
                              color: chrome.neutral,
                              line: true,
                              dash: "dotted" as const,
                            },
                          ]
                        : []),
                    ]}
                  />
                )
              }
              notes={notes}
              emptyMessage={empty ? t("empty", { element }) : null}
            >
              {empty ? null : <DuplicateChart element={element} pairs={pairs} chrome={chrome} reducedMotion={reducedMotion} />}
            </ChartCard>
          );
        })}
    </div>
  );
}
