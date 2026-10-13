"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { cn } from "@/core/lib/utils";
import type { AnalyticsResult } from "@/modules/lab/lib/analytics/analytics-types";
import { CountUp } from "@/core/components/ui/count-up";
import { formatCount, formatHours, NO_VALUE } from "@/core/lib/ui/kpi-format";
import { KPI_KEYS, type KpiKey } from "@/modules/lab/lib/analytics/dashboard-layout";
import type { IconType } from "react-icons";
import { IoCheckmarkCircleOutline, IoCubeOutline, IoFlaskOutline, IoReloadOutline, IoTimerOutline, IoWarningOutline } from "react-icons/io5";

interface KpiItem {
  label: string;
  /** Null only where there is no figure at all, which is not zero. */
  value: number | null;
  format: (value: number) => string;
  hint?: string;
  icon: IconType;
  accent: string;
  /** A tile that jumps to the section explaining it. */
  href?: string;
}

interface KpiCardsProps {
  kpi: AnalyticsResult["kpi"];
  /** Human-readable window the figures cover, e.g. "Last 14 days". */
  rangeLabel: string;
  /** Which tiles, in order; the first is the highlighted one. See dashboard-layout.ts. */
  keys?: readonly KpiKey[];
}

/**
 * Columns for however many tiles a role gets, written out whole so Tailwind
 * can find them. Six across only where six actually fit: xl starts at 1280px,
 * which on a 1366px laptop left about 180px per tile for a label, an icon, a
 * large number and a hint, so 2xl holds it back until there is room. Fewer
 * tiles fill the row rather than leaving a hole at its end.
 */
const GRID_FOR_COUNT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5",
  6: "grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6",
};

export function KpiCards({ kpi, rangeLabel, keys = KPI_KEYS }: KpiCardsProps) {
  const t = useTranslations("dashboard.kpi");

  const all = {
    samples: {
      label: t("samples"),
      value: kpi.total,
      format: formatCount,
      hint: rangeLabel,
      icon: IoCubeOutline,
      accent: "text-primary bg-primary/10",
    },
    inProgress: {
      label: t("inProgress"),
      value: kpi.inProgress,
      format: formatCount,
      icon: IoReloadOutline,
      accent: "text-blue-600 bg-blue-100 dark:bg-blue-500/15",
    },
    completed: {
      label: t("completed"),
      value: kpi.completed,
      format: formatCount,
      hint:
        kpi.total > 0
          ? t("completedHint", { percent: Math.round((kpi.completed / kpi.total) * 100) })
          : undefined,
      icon: IoCheckmarkCircleOutline,
      accent: "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15",
    },
    cycleTime: {
      label: t("cycleTime"),
      // The only tile that can have no figure at all, which is not zero hours.
      value: kpi.averageCycleHours,
      format: formatHours,
      hint: t("cycleTimeHint"),
      icon: IoTimerOutline,
      accent: "text-violet-600 bg-violet-100 dark:bg-violet-500/15",
    },
    awaitingAssay: {
      label: t("awaitingAssay"),
      value: kpi.awaitingAssay,
      format: formatCount,
      hint: t("awaitingAssayHint"),
      icon: IoFlaskOutline,
      accent: "text-amber-600 bg-amber-100 dark:bg-amber-500/15",
    },
    needsAttention: {
      label: t("needsAttention"),
      value: kpi.overdue,
      format: formatCount,
      hint: t("needsAttentionHint"),
      icon: IoWarningOutline,
      accent:
        kpi.overdue > 0 ? "text-destructive bg-destructive/10" : "text-muted-foreground bg-muted",
      href: "#needs-attention",
    },
  } satisfies Record<KpiKey, KpiItem>;

  const items: KpiItem[] = keys.map((key) => all[key]);

  return (
    <div className={cn("grid gap-4", GRID_FOR_COUNT[items.length] ?? GRID_FOR_COUNT[6])} data-tour="dashboard-kpis">
      {items.map((item, index) => {
        const Icon = item.icon;
        // The first tile is the headline figure and wears the gradient. One
        // per row, deliberately: a gradient on every tile is a gradient on
        // none, and the point of it is to say which number to read first.
        const isHero = index === 0;

        const card = (
          <Card
            className={cn(
              "h-full",
              isHero && "surface-hero border-0 text-white",
              item.href && !isHero && "transition-colors hover:bg-muted/40",
              item.href && isHero && "transition-[filter] hover:brightness-110"
            )}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <CardTitle
                className={cn(
                  "text-sm font-medium",
                  isHero ? "text-white/90" : "text-muted-foreground"
                )}
              >
                {item.label}
              </CardTitle>
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  isHero ? "bg-white/15 text-white" : item.accent
                )}
              >
                <Icon className="size-4.5" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">
                <CountUp value={item.value} format={item.format} />
              </p>
              {item.hint ? (
                <p className={cn("mt-0.5 text-xs", isHero ? "text-white/85" : "text-muted-foreground")}>
                  {item.hint}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );

        // The SLA tile jumps to the table further down the same page.
        return item.href ? (
          <a key={item.label} href={item.href} aria-label={`${item.label}: ${item.value === null ? NO_VALUE : item.format(item.value)}`}>
            {card}
          </a>
        ) : (
          <div key={item.label}>{card}</div>
        );
      })}
    </div>
  );
}
