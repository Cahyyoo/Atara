"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { KpiCards } from "@/modules/lab/components/dashboard/kpi-cards";

/**
 * Charts arrive in their own chunk. ssr: false because a ResponsiveContainer
 * has to measure the element it lives in, so there is nothing useful to render
 * on the server anyway.
 */
const DashboardCharts = dynamic(
  () => import("@/modules/lab/components/dashboard/dashboard-charts").then((m) => m.DashboardCharts),
  {
    ssr: false,
    // Shaped like the real block — one wide chart above a 2x2 grid — so the
    // page does not jump when the chunk lands.
    loading: () => (
      <>
        <div className="h-[332px] animate-pulse rounded-xl bg-muted/40" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-[332px] animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      </>
    ),
  }
);
import type { AnalyticsResult } from "@/modules/lab/lib/analytics/analytics-types";
import { DEFAULT_WINDOW_DAYS } from "@/modules/lab/lib/analytics/analytics-range";
import type { DashboardLayout } from "@/modules/lab/lib/analytics/dashboard-layout";
import { IoReloadOutline } from "react-icons/io5";
import { useDashboardAnalytics } from "@/modules/lab/components/dashboard/dashboard-overview/use-dashboard-analytics";
import { DashboardToolbar } from "@/modules/lab/components/dashboard/dashboard-overview/dashboard-toolbar";
import { DashboardFilterPanel } from "@/modules/lab/components/dashboard/dashboard-overview/dashboard-filter-panel";
import { DashboardFilterChips } from "@/modules/lab/components/dashboard/dashboard-overview/dashboard-filter-chips";
import { NeedsAttentionSection } from "@/modules/lab/components/dashboard/dashboard-overview/needs-attention-section";

export { AUTO_REFRESH_MS } from "@/modules/lab/components/dashboard/dashboard-overview/use-dashboard-analytics";

interface DashboardOverviewProps {
  /** What this role's dashboard shows; see dashboard-layout.ts. */
  layout: DashboardLayout;
  /** The default window, already computed on the server. */
  initialAnalytics: AnalyticsResult;
  /**
   * The operator's own shift, rendered on the server. Above the date controls
   * on purpose: it follows the shift, and nothing below it changes it.
   */
  myScans?: ReactNode;
  /** Whether this role may download the summary workbook (exportDatabase). */
  canDownloadReport?: boolean;
  /** The all-time sample table, slotted in below the range-scoped sections. */
  children?: ReactNode;
}

export function DashboardOverview({
  layout,
  initialAnalytics,
  myScans,
  canDownloadReport = false,
  children,
}: DashboardOverviewProps) {
  const t = useTranslations("dashboard");
  const tMaster = useTranslations("masterData");
  const {
    from,
    setFrom,
    to,
    setTo,
    range,
    identity,
    setIdentityAt,
    activeIdentity,
    clearIdentity,
    subs,
    setSubs,
    codeById,
    data,
    error,
    isRefreshing,
    hasFilter,
    resetAll,
    isPolling,
    refreshNow,
    isDownloading,
    downloadReport,
  } = useDashboardAnalytics(initialAnalytics);
  const [showTable, setShowTable] = useState(false);
  /** The five pickers live behind one button; this opens them in place. */
  const [showFilters, setShowFilters] = useState(false);

  // What each active filter is actually set to, named by its code. Previously
  // only the place could be named this way, because placeSplit happened to
  // carry it, and the other four were reduced to their kind — which says
  // nothing about what is filtered.
  const activeChips = activeIdentity.map(({ key, kind }) => ({
    key,
    kind,
    label: tMaster(`kind.${kind}`),
    code: codeById.get(identity[key]) ?? identity[key],
  }));
  const filterLabels = activeChips.map((chip) => chip.code);

  // Says what is on screen, so a filtered figure is never mistaken for the
  // whole lab.
  const rangeLabel = [
    data && (range.from || range.to)
      ? `${data.range.from.slice(0, 10)} → ${data.range.to.slice(0, 10)}`
      : t("rangeLabel", { days: DEFAULT_WINDOW_DAYS }),
    ...filterLabels,
  ].join(" · ");

  return (
    <div className="flex flex-col gap-6">
      {myScans}

      {/* These controls govern every figure and chart below them. */}
      <DashboardToolbar
        from={from}
        onFromChange={setFrom}
        to={to}
        onToChange={setTo}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((open) => !open)}
        filterCount={activeIdentity.length + (subs !== "parents" ? 1 : 0)}
        canReset={Boolean(from || to || hasFilter)}
        onReset={resetAll}
        generatedAt={data?.generatedAt}
        isPolling={isPolling}
        isRefreshing={isRefreshing}
        onRefresh={() => void refreshNow()}
        canDownloadReport={canDownloadReport}
        isDownloading={isDownloading}
        onDownload={() => void downloadReport()}
      />

      {showFilters ? (
        <DashboardFilterPanel
          identity={identity}
          onIdentityChange={setIdentityAt}
          subs={subs}
          onSubsChange={setSubs}
        />
      ) : null}

      {/* A filter behind a button changes every figure on this page. Leaving it
          invisible is how a report gets misread, so what is applied stays on
          screen whether the panel is open or not. */}
      {activeChips.length > 0 ? (
        <DashboardFilterChips chips={activeChips} onRemove={clearIdentity} />
      ) : null}

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : !data ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <IoReloadOutline className="size-6 animate-spin" />
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-6 transition-opacity",
            isRefreshing && "pointer-events-none opacity-60"
          )}
          aria-busy={isRefreshing}
        >
          <KpiCards kpi={data.kpi} rangeLabel={rangeLabel} keys={layout.kpis} />

          {layout.charts.length > 0 ? <DashboardCharts data={data} charts={layout.charts} /> : null}

          {/* The samples past their stage SLA: for the roles that chase them. */}
          {layout.needsAttention ? (
            <NeedsAttentionSection
              data={data}
              showTable={showTable}
              onToggleTable={() => setShowTable((previous) => !previous)}
            />
          ) : null}
        </div>
      )}

      {children ? (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("allSamples.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("allSamples.subtitle")}</p>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}
