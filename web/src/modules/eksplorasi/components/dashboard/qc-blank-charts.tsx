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
import { isAnomaly } from "@/modules/eksplorasi/lib/qc-blank";
import {
  ChartCard,
  ChartLegend,
  POINT,
  STATUS,
  axis,
  baseOptions,
  referenceLine,
  type LegendItem,
  type LinePoint,
} from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";
import type { BlankPoint, QcBlank } from "@/modules/eksplorasi/types";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

/** The Preferred Value: the most a blank may read, so a pass/fail line -- the critical colour, solid. */
const LIMIT_COLOR = STATUS.critical;

type BlankEntry = QcBlank["elements"][number];

/** From 0 -- a blank should read nothing -- to past both the highest reading and the line. */
function valueRange(points: readonly BlankPoint[], limit: number | null): { min: number; max: number } {
  const high = Math.max(limit ?? 0, ...points.map((point) => point.y));
  return { min: 0, max: high > 0 ? high * 1.1 : 1 };
}

function BlankChart({
  element,
  points,
  limit,
  chrome,
  reducedMotion,
}: {
  element: string;
  points: BlankPoint[];
  limit: number | null;
  chrome: ChartChrome;
  reducedMotion: boolean;
}) {
  const t = useTranslations("qcDashboard.blank");
  const format = useFormatter();
  // The readings in the card's ink; one taken at the detection limit in the neutral, so it reads as "no more than".
  const ink = chrome.popoverText;

  const { datasets, options } = useMemo(() => {
    const n = (value: number) => format.number(value, { maximumFractionDigits: 4 });
    const colorOf = (point: BlankPoint) =>
      limit !== null && isAnomaly(point, limit) ? STATUS.critical : point.belowDetection ? chrome.neutral : ink;

    const readings: ChartDataset<"scatter", (BlankPoint | LinePoint)[]> = {
      label: t("readings"),
      data: points,
      backgroundColor: points.map(colorOf),
      borderColor: chrome.surface,
      ...POINT,
    };
    const first = points[0]?.x ?? 0;
    const last = points.at(-1)?.x ?? 1;
    const lines =
      limit === null
        ? []
        : [
            referenceLine<BlankPoint>(
              t("limit", { value: n(limit) }),
              [
                { x: first, y: limit },
                { x: last, y: limit },
              ],
              LIMIT_COLOR,
              []
            ),
          ];

    const options: ChartOptions<"scatter"> = {
      ...baseOptions(chrome, reducedMotion),
      scales: {
        x: { ...axis(chrome, t("axisX")), ticks: { ...axis(chrome, "").ticks, precision: 0 } },
        y: { ...axis(chrome, t("axisY", { element })), ...valueRange(points, limit) },
      },
    };
    options.plugins!.tooltip = {
      ...options.plugins!.tooltip,
      // The line is a reference, not a reading.
      filter: (item: TooltipItem<"scatter">) => item.datasetIndex === 0,
      callbacks: {
        title: (items: TooltipItem<"scatter">[]) => (items[0]?.raw as BlankPoint | undefined)?.sampleId ?? "",
        label: (item: TooltipItem<"scatter">) => {
          const point = item.raw as BlankPoint;
          const values = { index: point.x, value: n(point.y) };
          return point.belowDetection ? t("pointBelow", values) : t("point", values);
        },
      },
    };
    return { datasets: [readings, ...lines], options };
  }, [points, limit, chrome, reducedMotion, ink, element, t, format]);

  return <Scatter data={{ datasets }} options={options} aria-label={t("chartTitle", { element })} role="img" />;
}

function BlankCard({ entry, chrome, reducedMotion }: { entry: BlankEntry; chrome: ChartChrome; reducedMotion: boolean }) {
  const t = useTranslations("qcDashboard.blank");
  const format = useFormatter();
  const element = ELEMENT_LABELS[entry.element];
  const { points, limit, skipped } = entry;
  const anomalies = limit === null ? 0 : points.filter((point) => isAnomaly(point, limit)).length;
  const below = points.filter((point) => point.belowDetection).length;
  const empty = points.length === 0;

  const legend: LegendItem[] = [
    { label: t("readings"), color: chrome.popoverText },
    ...(below > 0 ? [{ label: t("belowLegend"), color: chrome.neutral }] : []),
    ...(limit !== null
      ? [
          { label: t("anomalyLegend"), color: STATUS.critical },
          { label: t("limit", { value: format.number(limit, { maximumFractionDigits: 4 }) }), color: LIMIT_COLOR, line: true },
        ]
      : []),
  ];

  return (
    <ChartCard
      title={t("chartTitle", { element })}
      description={t("count", { count: points.length })}
      legend={empty ? null : <ChartLegend items={legend} />}
      notes={[
        ...(limit === null ? [t("noLimit", { element })] : []),
        ...(anomalies > 0 ? [t("anomalies", { count: anomalies })] : []),
        ...(below > 0 ? [t("below", { count: below })] : []),
        ...(skipped > 0 ? [t("skipped", { count: skipped })] : []),
      ]}
      emptyMessage={empty ? t("empty", { element }) : null}
    >
      <BlankChart element={element} points={points} limit={limit} chrome={chrome} reducedMotion={reducedMotion} />
    </ChartCard>
  );
}

/**
 * The blank charts: a card per element shown -- each blank's reading at its
 * Sample Index, the CRM List's Preferred Value as a red line, a reading past
 * it in red and counted. A reading written "<0.01" is drawn at the limit in
 * the neutral colour.
 */
export function QcBlankCharts({ entries }: { entries: BlankEntry[] }) {
  const theme = useTheme();
  const chrome = useMemo(() => readChartChrome(theme), [theme]);
  const reducedMotion = useReducedMotion();

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {entries.map((entry) => (
        <BlankCard key={entry.element} entry={entry} chrome={chrome} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}
