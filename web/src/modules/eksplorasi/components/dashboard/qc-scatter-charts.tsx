"use client";

import { useMemo, type ReactNode } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { CHART_ANIMATION_MS, GRID_DASH, SERIES, categoricalColor, readChartChrome, type ChartChrome } from "@/core/lib/ui/chart-theme";
import { useTheme } from "@/core/components/layout/theme-provider";
import { useReducedMotion } from "@/core/lib/ui/use-reduced-motion";
import { ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import { byControl, oneToOne } from "@/modules/eksplorasi/lib/qc-chart";
import type { DuplicatePair, QcCharts, StandardPoint } from "@/modules/eksplorasi/types";

// Only the pieces a scatter with a reference line uses. The legend is DOM
// above each chart (ChartLegend), so Chart.js's own is registered but off.
ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

/** A point's look: small, filled, a ring of the card's colour so overlapping points stay apart. */
const POINT = { pointRadius: 3.5, pointHoverRadius: 5.5, pointBorderWidth: 1 };

function axis(chrome: ChartChrome, title: string) {
  return {
    type: "linear" as const,
    title: { display: true, text: title, color: chrome.axisText, font: { size: 11 } },
    grid: { color: chrome.grid, drawTicks: false, lineWidth: 1 },
    border: { display: false, dash: [...GRID_DASH] },
    ticks: { color: chrome.axisText, font: { size: 11 } },
  };
}

function baseOptions(chrome: ChartChrome, reducedMotion: boolean): ChartOptions<"scatter"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion ? false : { duration: CHART_ANIMATION_MS, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: chrome.popover,
        titleColor: chrome.popoverText,
        bodyColor: chrome.popoverText,
        borderWidth: 0,
        padding: 12,
        cornerRadius: 12,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
      },
    },
  };
}

/**
 * Identity never rests on colour alone: a chart with more than one series
 * names them in plain DOM, outside the canvas a screen reader cannot enter.
 */
function ChartLegend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={item.line ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-full"}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A chart's card: its name, what it shows, its legend, and the chart or why there is none. */
function ChartCard({
  title,
  description,
  legend,
  notes,
  emptyMessage,
  children,
}: {
  title: string;
  description: string;
  legend?: ReactNode;
  notes: string[];
  emptyMessage: string | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {legend ? <div className="pt-1">{legend}</div> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {emptyMessage ? (
          <p className="flex h-72 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="h-80">{children}</div>
        )}
        {notes.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

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
