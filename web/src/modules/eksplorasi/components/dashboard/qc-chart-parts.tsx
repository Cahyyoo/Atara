"use client";

import type { ReactNode } from "react";
import type { ChartDataset, ChartOptions } from "chart.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { CHART_ANIMATION_MS, GRID_DASH, type ChartChrome } from "@/core/lib/ui/chart-theme";

/**
 * What the dashboard's charts share: the look of a point, the axes, the
 * tooltip, the DOM legend and the card around each chart -- the control
 * charts and the duplicate charts read as one set.
 */

/**
 * Thresholds wear status colours -- good, warning, critical -- and never a
 * series colour, the same in both themes. The yellow is under 3:1 on a light
 * card, so every line also has its own pattern and is named in the legend.
 */
export const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" } as const;

/** The 10% a duplicate is held to, on every chart that draws it: one colour, one pattern. */
export const TOLERANCE_LINE = { color: STATUS.warning, dash: [6, 4] };

/** Two ends of a straight reference line. */
export type LinePoint = { x: number; y: number };

/** A reference line's dataset: drawn, with no points of its own to hover. */
export function referenceLine<T>(
  label: string,
  data: LinePoint[],
  color: string,
  dash: readonly number[]
): ChartDataset<"scatter", (T | LinePoint)[]> {
  return { label, data, showLine: true, borderColor: color, borderWidth: 2, borderDash: [...dash], pointRadius: 0, pointHoverRadius: 0 };
}

/** A point's look: small, filled, a ring of the card's colour so overlapping points stay apart. */
export const POINT = { pointRadius: 3.5, pointHoverRadius: 5.5, pointBorderWidth: 1 };

export function axis(chrome: ChartChrome, title: string) {
  return {
    type: "linear" as const,
    title: { display: true, text: title, color: chrome.axisText, font: { size: 11 } },
    grid: { color: chrome.grid, drawTicks: false, lineWidth: 1 },
    border: { display: false, dash: [...GRID_DASH] },
    ticks: { color: chrome.axisText, font: { size: 11 } },
  };
}

export function baseOptions(chrome: ChartChrome, reducedMotion: boolean): ChartOptions<"scatter"> {
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

/** One entry of a chart's legend. */
export interface LegendItem {
  label: string;
  color: string;
  /** Drawn as a line rather than a dot: a reference, not a reading. */
  line?: boolean;
  /** The line's pattern, matching the chart's, so a line is told apart by more than its colour. */
  dash?: "solid" | "dashed" | "dotted";
}

/**
 * Identity never rests on colour alone: a chart with more than one series
 * names them in plain DOM, outside the canvas a screen reader cannot enter.
 */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.line && item.dash && item.dash !== "solid" ? (
            <span aria-hidden className="w-5 border-t-2" style={{ borderColor: item.color, borderTopStyle: item.dash }} />
          ) : (
            <span
              aria-hidden
              className={item.line ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-full"}
              style={{ backgroundColor: item.color }}
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** A chart's card: its name, what it shows, its legend, and the chart or why there is none. */
export function ChartCard({
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
