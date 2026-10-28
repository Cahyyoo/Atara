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
import { SERIES, categoricalColor, readChartChrome } from "@/core/lib/ui/chart-theme";
import { ChartCard, ChartLegend, POINT, axis, baseOptions } from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";
import { useTheme } from "@/core/components/layout/theme-provider";
import { useReducedMotion } from "@/core/lib/ui/use-reduced-motion";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import { byControl, oneToOne } from "@/modules/eksplorasi/lib/qc-chart";
import type { DuplicatePair, QcCharts, StandardPoint } from "@/modules/eksplorasi/types";

// Only the pieces a scatter with a reference line uses. The legend is DOM
// above each chart (ChartLegend), so Chart.js's own is registered but off.
ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

/**
 * The two QC scatter plots for one element.
 *
 * Standard (CRM): each STANDARD assay at its date, one colour per CRM, so a
 * drifting standard shows as a slope and a bad batch as a jump.
 *
 * Duplicate: each DUPLICATE against the sample it repeats, with the 1:1 line
 * a perfect repeat would sit on -- the further a point from the line, the
 * worse the precision.
 */
export function QcScatterCharts({ data }: { data: QcCharts }) {
  const t = useTranslations("qcDashboard");
  const format = useFormatter();
  const theme = useTheme();
  const chrome = useMemo(() => readChartChrome(theme), [theme]);
  const reducedMotion = useReducedMotion();
  const element = ELEMENT_LABELS[data.element];
  const n = (value: number) => format.number(value);
  const day = (ms: number) => format.dateTime(new Date(ms), { dateStyle: "medium", timeZone: "UTC" });

  const standard = useMemo(() => {
    const groups = byControl(data.standard.points);
    const datasets: ChartDataset<"scatter", StandardPoint[]>[] = groups.map((group, index) => {
      const color = categoricalColor(index, chrome.neutral);
      return {
        label: group.control,
        data: group.points,
        backgroundColor: color,
        borderColor: chrome.surface,
        ...POINT,
      };
    });
    const options: ChartOptions<"scatter"> = {
      ...baseOptions(chrome, reducedMotion),
      scales: {
        x: { ...axis(chrome, t("standard.axisX")), ticks: { ...axis(chrome, "").ticks, maxTicksLimit: 8, callback: (value) => day(Number(value)) } },
        y: axis(chrome, t("axisValue", { element })),
      },
    };
    options.plugins!.tooltip = {
      ...options.plugins!.tooltip,
      callbacks: {
        title: (items: TooltipItem<"scatter">[]) => (items[0]?.raw as StandardPoint | undefined)?.sampleId ?? "",
        label: (item: TooltipItem<"scatter">) => {
          const point = item.raw as StandardPoint;
          return `${point.control} · ${day(point.x)} · ${element} ${n(point.y)}`;
        },
      },
    };
    const legend = groups.map((group, index) => ({ label: group.control, color: categoricalColor(index, chrome.neutral) }));
    return { datasets, options, legend };
    // `day` and `n` follow the locale, which `format` carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.standard.points, chrome, reducedMotion, t, element, format]);

  const duplicate = useMemo(() => {
    const ends = oneToOne(data.duplicate.pairs);
    const datasets: ChartDataset<"scatter", (DuplicatePair | { x: number; y: number })[]>[] = [
      {
        label: t("duplicate.pairs"),
        data: data.duplicate.pairs,
        backgroundColor: SERIES.primary,
        borderColor: chrome.surface,
        ...POINT,
      },
    ];
    if (ends) {
      datasets.push({
        label: t("duplicate.oneToOne"),
        data: [
          { x: ends[0], y: ends[0] },
          { x: ends[1], y: ends[1] },
        ],
        showLine: true,
        borderColor: SERIES.secondary,
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
      });
    }
    const options: ChartOptions<"scatter"> = {
      ...baseOptions(chrome, reducedMotion),
      scales: {
        x: axis(chrome, t("duplicate.axisX", { element })),
        y: axis(chrome, t("duplicate.axisY", { element })),
      },
    };
    options.plugins!.tooltip = {
      ...options.plugins!.tooltip,
      // The 1:1 line is a reference, not a reading.
      filter: (item: TooltipItem<"scatter">) => item.datasetIndex === 0,
      callbacks: {
        title: (items: TooltipItem<"scatter">[]) => (items[0]?.raw as DuplicatePair | undefined)?.sampleId ?? "",
        label: (item: TooltipItem<"scatter">) => {
          const pair = item.raw as DuplicatePair;
          return [`${t("duplicate.original")} ${pair.originalId}: ${n(pair.x)}`, `${t("duplicate.duplicate")}: ${n(pair.y)}`];
        },
      },
    };
    const legend = [
      { label: t("duplicate.pairs"), color: SERIES.primary },
      { label: t("duplicate.oneToOne"), color: SERIES.secondary, line: true },
    ];
    return { datasets, options, legend };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.duplicate.pairs, chrome, reducedMotion, t, element, format]);

  const standardNotes = [
    ...(data.standard.skipped > 0 ? [t("standard.skipped", { count: data.standard.skipped })] : []),
    ...(data.standard.truncated ? [t("truncated")] : []),
  ];
  const duplicateNotes = [
    t("duplicate.count", { count: data.duplicate.pairs.length }),
    ...(data.duplicate.unmatched > 0 ? [t("duplicate.unmatched", { count: data.duplicate.unmatched })] : []),
    ...(data.duplicate.skipped > 0 ? [t("duplicate.skipped", { count: data.duplicate.skipped })] : []),
    ...(data.duplicate.truncated ? [t("truncated")] : []),
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard
        title={t("standard.title")}
        description={t("standard.description", { element })}
        legend={standard.legend.length > 1 ? <ChartLegend items={standard.legend} /> : null}
        notes={standardNotes}
        emptyMessage={data.standard.points.length === 0 ? t("standard.empty", { element }) : null}
      >
        <Scatter data={{ datasets: standard.datasets }} options={standard.options} aria-label={t("standard.title")} role="img" />
      </ChartCard>
      <ChartCard
        title={t("duplicate.title")}
        description={t("duplicate.description", { element })}
        legend={data.duplicate.pairs.length > 0 ? <ChartLegend items={duplicate.legend} /> : null}
        notes={duplicateNotes}
        emptyMessage={data.duplicate.pairs.length === 0 ? t("duplicate.empty", { element }) : null}
      >
        <Scatter data={{ datasets: duplicate.datasets }} options={duplicate.options} aria-label={t("duplicate.title")} role="img" />
      </ChartCard>
    </div>
  );
}
