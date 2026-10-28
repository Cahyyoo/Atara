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
import { valueRange, zScore, type ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import {
  ChartCard,
  ChartLegend,
  POINT,
  STATUS,
  axis,
  baseOptions,
  type LegendItem,
} from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";
import type { ControlLimits, ControlPoint, QcControl } from "@/modules/eksplorasi/types";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

/** The control lines in status colours (STATUS), each band with its own pattern: dotted, dashed, solid. */
const BANDS = [
  { sigma: 1, color: STATUS.good, dash: [2, 3], legendDash: "dotted" },
  { sigma: 2, color: STATUS.warning, dash: [6, 4], legendDash: "dashed" },
  { sigma: 3, color: STATUS.critical, dash: [], legendDash: "solid" },
] as const;

/** A reading past ±3σ: drawn in the critical colour, and counted under the chart. */
const CRITICAL = BANDS[2].color;

type Line = { x: number; y: number };

const isOutside = (point: ControlPoint, limits: ControlLimits) => Math.abs(zScore(point.y, limits)) > 3;

/** The two ends of a horizontal line at `y`, across the readings. */
const across = (y: number, from: number, to: number): Line[] => [
  { x: from, y },
  { x: to, y },
];

function ControlChart({
  element,
  standard,
  limits,
  points,
  chrome,
  reducedMotion,
}: {
  element: string;
  standard: string;
  limits: ControlLimits;
  points: ControlPoint[];
  chrome: ChartChrome;
  reducedMotion: boolean;
}) {
  const t = useTranslations("qcDashboard.control");
  const format = useFormatter();
  // The readings in the card's ink, like the lab's sheet: colour belongs to the lines.
  const ink = chrome.popoverText;

  const { datasets, options } = useMemo(() => {
    const xs = points.map((point) => point.x);
    const from = Math.min(...xs);
    const to = Math.max(...xs);
    const n = (value: number) => format.number(value, { maximumFractionDigits: 4 });

    const readings: ChartDataset<"scatter", (ControlPoint | Line)[]> = {
      label: t("readings", { element }),
      data: points,
      // One colour per point, in the points' order.
      backgroundColor: points.map((point) => (isOutside(point, limits) ? CRITICAL : ink)),
      borderColor: chrome.surface,
      ...POINT,
    };
    const lines: ChartDataset<"scatter", (ControlPoint | Line)[]>[] = BANDS.flatMap((band) =>
      (["plus", "minus"] as const).map((side) => ({
        label: t(`${side}${band.sigma}`),
        data: across(limits[`${side}${band.sigma}`], from, to),
        showLine: true,
        borderColor: band.color,
        borderWidth: 2,
        borderDash: [...band.dash],
        pointRadius: 0,
        pointHoverRadius: 0,
      }))
    );

    const range = valueRange(points, limits);
    const options: ChartOptions<"scatter"> = {
      ...baseOptions(chrome, reducedMotion),
      scales: {
        x: { ...axis(chrome, t("axisX")), ticks: { ...axis(chrome, "").ticks, precision: 0 } },
        y: { ...axis(chrome, t("axisY", { element })), ...(range ?? {}) },
      },
    };
    options.plugins!.tooltip = {
      ...options.plugins!.tooltip,
      // The lines are references, not readings.
      filter: (item: TooltipItem<"scatter">) => item.datasetIndex === 0,
      callbacks: {
        title: (items: TooltipItem<"scatter">[]) => (items[0]?.raw as ControlPoint | undefined)?.sampleId ?? "",
        label: (item: TooltipItem<"scatter">) => {
          const point = item.raw as ControlPoint;
          const sigma = zScore(point.y, limits);
          const values = {
            index: point.x,
            value: n(point.y),
            sigma: `${sigma >= 0 ? "+" : "−"}${format.number(Math.abs(sigma), { maximumFractionDigits: 1 })}`,
          };
          return point.date
            ? t("point", {
                ...values,
                date: format.dateTime(new Date(`${point.date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }),
              })
            : t("pointNoDate", values);
        },
      },
    };
    return { datasets: [readings, ...lines], options };
  }, [points, limits, chrome, reducedMotion, ink, element, t, format]);

  return (
    <Scatter data={{ datasets }} options={options} aria-label={`${element} · ${standard}`} role="img" />
  );
}

/**
 * One OREAS standard's control charts: a card per element shown (`elements`),
 * each reading at its sample index against the certified value's ±1σ, ±2σ
 * and ±3σ. A card says why it has no chart rather than drawing an empty one:
 * no value or SD in the CRM List, or no assays of the standard yet.
 */
export function QcControlCharts({ data, elements }: { data: QcControl; elements: readonly ControlElement[] }) {
  const t = useTranslations("qcDashboard.control");
  const format = useFormatter();
  const theme = useTheme();
  const chrome = useMemo(() => readChartChrome(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const standard = data.standard ?? "";
  const method = data.testMethod;
  const n = (value: number) => format.number(value, { maximumFractionDigits: 4 });

  // The three bands, each named with both its lines: "+1σ / −1σ".
  const bandLegend: LegendItem[] = BANDS.map((band) => ({
    label: `${t(`plus${band.sigma}`)} / ${t(`minus${band.sigma}`)}`,
    color: band.color,
    line: true,
    dash: band.legendDash,
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {data.elements.filter(({ element }) => elements.includes(element)).map(({ element: field, limits, points, skipped }) => {
        const element = ELEMENT_LABELS[field];
        const outside = limits ? points.filter((point) => isOutside(point, limits)).length : 0;
        const notes = [
          ...(skipped > 0 ? [t("skipped", { count: skipped })] : []),
          ...(outside > 0 ? [t("outside", { count: outside })] : []),
        ];
        const emptyMessage = !limits
          ? t("noLimits", { element, standard, method })
          : points.length === 0
            ? t("empty", { element, standard })
            : null;
        return (
          <ChartCard
            key={field}
            title={element}
            description={
              limits ? `${standard} · ${t("certified", { value: n(limits.certified), sd: n(limits.sd) })}` : standard
            }
            legend={
              emptyMessage ? null : <ChartLegend items={[{ label: element, color: chrome.popoverText }, ...bandLegend]} />
            }
            notes={notes}
            emptyMessage={emptyMessage}
          >
            {limits ? (
              <ControlChart
                element={element}
                standard={standard}
                limits={limits}
                points={points}
                chrome={chrome}
                reducedMotion={reducedMotion}
              />
            ) : null}
          </ChartCard>
        );
      })}
    </div>
  );
}
