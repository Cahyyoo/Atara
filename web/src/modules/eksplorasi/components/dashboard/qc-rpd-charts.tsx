"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ChartDataset, ChartOptions, TooltipItem } from "chart.js";
import { Scatter } from "react-chartjs-2";
import type { ChartChrome } from "@/core/lib/ui/chart-theme";
import {
  RPD_FLAG,
  RPD_LIMIT,
  isRpdFlagged,
  rpdDistribution,
  type RpdPoint,
} from "@/modules/eksplorasi/lib/qc-duplicate";
import {
  POINT,
  STATUS,
  TOLERANCE_LINE,
  axis,
  baseOptions,
  referenceLine,
  type LinePoint,
} from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";

/**
 * The duplicates' RPD charts, as the lab's QC workbook draws them: each
 * pair's RPD in the order the duplicates were taken, a pair at 20% or more
 * marked, and the RPDs sorted against the share of pairs (the distribution),
 * read against the CRM List's 10%. Plotted in percent. The chart library is
 * registered by qc-duplicate-charts.tsx, which renders these.
 */

/** The 20% mark on the RPD graph: a pair past it is a failure, so the critical colour. */
const FLAG_LINE = { color: STATUS.critical, dash: [2, 3] };

/** A plotted RPD: the pair it belongs to, at x, its RPD in percent at y. */
type Plotted = RpdPoint & { x: number; y: number };

const percent = (share: number) => share * 100;

interface RpdChartProps {
  element: string;
  points: RpdPoint[];
  chrome: ChartChrome;
  reducedMotion: boolean;
}

/** The tooltip both charts share: the duplicate, its original, its RPD. */
function useRpdTooltip(extra?: (point: Plotted) => string) {
  const t = useTranslations("qcDashboard.duplicate");
  const format = useFormatter();
  return useMemo(
    () => ({
      // The lines are references, not readings.
      filter: (item: TooltipItem<"scatter">) => item.datasetIndex === 0,
      callbacks: {
        title: (items: TooltipItem<"scatter">[]) => (items[0]?.raw as Plotted | undefined)?.sampleId ?? "",
        label: (item: TooltipItem<"scatter">) => {
          const point = item.raw as Plotted;
          const line = t("rpdPoint", {
            originalId: point.originalId,
            rpd: format.number(point.y, { maximumFractionDigits: 1 }),
          });
          return extra ? [line, extra(point)] : line;
        },
      },
    }),
    [t, format, extra]
  );
}

/** Each pair's RPD at its Sample Index, joined so a run of poor pairs shows; 20% or more in red. */
export function RpdGraphChart({ element, points, chrome, reducedMotion }: RpdChartProps) {
  const t = useTranslations("qcDashboard.duplicate");
  const tooltip = useRpdTooltip();
  const ink = chrome.popoverText;

  const { datasets, options } = useMemo(() => {
    const plotted: Plotted[] = points.map((point) => ({ ...point, x: point.index, y: percent(point.rpd) }));
    const first = points[0]?.index ?? 0;
    const last = points.at(-1)?.index ?? 1;

    const readings: ChartDataset<"scatter", (Plotted | LinePoint)[]> = {
      label: t("rpdSeries", { element }),
      data: plotted,
      showLine: true,
      borderColor: chrome.neutral,
      borderWidth: 1,
      backgroundColor: points.map((point) => (isRpdFlagged(point) ? STATUS.critical : ink)),
      pointBorderColor: chrome.surface,
      ...POINT,
      pointRadius: points.map((point) => (isRpdFlagged(point) ? POINT.pointRadius : 2)),
    };
    const flag = referenceLine<Plotted>(
      t("rpdFlag"),
      [
        { x: first, y: percent(RPD_FLAG) },
        { x: last, y: percent(RPD_FLAG) },
      ],
      FLAG_LINE.color,
      FLAG_LINE.dash
    );

    const options: ChartOptions<"scatter"> = {
      ...baseOptions(chrome, reducedMotion),
      scales: {
        x: { ...axis(chrome, t("axisIndex")), ticks: { ...axis(chrome, "").ticks, precision: 0 } },
        y: { ...axis(chrome, t("axisRpd")), min: 0 },
      },
    };
    options.plugins!.tooltip = { ...options.plugins!.tooltip, ...tooltip };
    return { datasets: [readings, flag], options };
  }, [points, chrome, reducedMotion, ink, element, t, tooltip]);

  return <Scatter data={{ datasets }} options={options} aria-label={t("rpdGraphTitle", { element })} role="img" />;
}

/** The RPDs from smallest to largest against the share of pairs, with the CRM List's 10%. */
export function RpdDistributionChart({ element, points, chrome, reducedMotion }: RpdChartProps) {
  const t = useTranslations("qcDashboard.duplicate");
  const format = useFormatter();
  const cumulative = useMemo(
    () => (point: Plotted) => t("rpdCumulative", { share: format.number(point.x, { maximumFractionDigits: 1 }) }),
    [t, format]
  );
  const tooltip = useRpdTooltip(cumulative);
  const ink = chrome.popoverText;

  const { datasets, options } = useMemo(() => {
    const plotted: Plotted[] = rpdDistribution(points).map((point) => ({
      ...point,
      x: percent(point.cumulative),
      y: percent(point.rpd),
    }));

    const readings: ChartDataset<"scatter", (Plotted | LinePoint)[]> = {
      label: t("rpdSeries", { element }),
      data: plotted,
      backgroundColor: ink,
      borderColor: chrome.surface,
      ...POINT,
      pointRadius: 2.5,
    };
    const limit = referenceLine<Plotted>(
      t("rpdLimit"),
      [
        { x: 0, y: percent(RPD_LIMIT) },
        { x: 100, y: percent(RPD_LIMIT) },
      ],
      TOLERANCE_LINE.color,
      TOLERANCE_LINE.dash
    );

    const options: ChartOptions<"scatter"> = {
      ...baseOptions(chrome, reducedMotion),
      scales: {
        x: { ...axis(chrome, t("axisCumulative")), min: 0, max: 100 },
        y: { ...axis(chrome, t("axisRpd")), min: 0 },
      },
    };
    options.plugins!.tooltip = { ...options.plugins!.tooltip, ...tooltip };
    return { datasets: [readings, limit], options };
  }, [points, chrome, reducedMotion, ink, element, t, tooltip]);

  return <Scatter data={{ datasets }} options={options} aria-label={t("rpdDistributionTitle", { element })} role="img" />;
}
