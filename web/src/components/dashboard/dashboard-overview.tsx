"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MasterFilter } from "@/components/shared/master-filter";
import type { MasterKind } from "@/types";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { toast } from "@/components/ui/toast";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { downloadFromApi } from "@/lib/download";
import { formatSessionTime } from "@/lib/session-client";

/**
 * Charts arrive in their own chunk. ssr: false because a ResponsiveContainer
 * has to measure the element it lives in, so there is nothing useful to render
 * on the server anyway.
 */
const DashboardCharts = dynamic(
  () => import("@/components/dashboard/dashboard-charts").then((m) => m.DashboardCharts),
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
import type { AnalyticsResult } from "@/lib/analytics";
import { DEFAULT_WINDOW_DAYS } from "@/lib/analytics-range";
import type { ApiResult } from "@/types";
import { stageLabel } from "@/lib/stages";
import type { DashboardLayout } from "@/lib/dashboard-layout";
import { SubFilterSelect } from "@/components/shared/sub-filter-select";
import type { SubFilter } from "@/lib/validation";
import {
  IoChevronDown,
  IoClose,
  IoDownloadOutline,
  IoReorderFourOutline,
  IoFunnelOutline,
  IoReloadOutline,
  IoTvOutline,
  IoWarningOutline,
} from "react-icons/io5";

/** The identity dimensions the dashboard can be sliced by, in the order shown. */
const IDENTITY_FILTERS = [
  { key: "placeId", kind: "PLACE" },
  { key: "rockTypeId", kind: "ROCK_TYPE" },
  { key: "nonProdId", kind: "NON_PROD" },
  { key: "sirId", kind: "SIR" },
  { key: "pitId", kind: "PIT" },
] as const satisfies readonly { key: string; kind: MasterKind }[];

type IdentityKey = (typeof IDENTITY_FILTERS)[number]["key"];

/** Typing into a date field walks through several valid dates; only the last matters. */
const RANGE_DEBOUNCE_MS = 300;

/**
 * How often an open, visible dashboard asks for fresh figures. Twice the
 * server's analytics cache (30 s), so each poll is answered by at most one
 * computation shared with everybody else looking at the same window.
 */
export const AUTO_REFRESH_MS = 60_000;

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
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const tSamples = useTranslations("samples");
  const tDatabase = useTranslations("database");
  const tMaster = useTranslations("masterData");
  const loadError = tCommon("loadError");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  // Picked from a dropdown rather than typed, so unlike the dates these need no
  // debounce and apply straight away.
  // One shape for all five rather than five useStates and five setters: the
  // query, the "is anything filtered" test and the reset all read from it, so
  // adding or removing a dimension touches one list.
  const [identity, setIdentity] = useState<Record<IdentityKey, string>>(() =>
    Object.fromEntries(IDENTITY_FILTERS.map(({ key }) => [key, "ALL"])) as Record<IdentityKey, string>
  );
  const activeIdentity = IDENTITY_FILTERS.filter(({ key }) => identity[key] !== "ALL");
  /** Which records the result figures count; the samples alone unless chosen otherwise. */
  const [subs, setSubs] = useState<SubFilter>("parents");
  const [showTable, setShowTable] = useState(false);
  /** The five pickers live behind one button; this opens them in place. */
  const [showFilters, setShowFilters] = useState(false);
  /**
   * Master option id to code, fetched once. The pickers only ever hand back an
   * id, and a chip reading a cuid would tell the reader nothing about what is
   * filtered. Without activeOnly: a retired code can still be the active filter,
   * and it has to stay readable.
   */
  const [codeById, setCodeById] = useState<Map<string, string>>(new Map());

  // The loaded window is tagged with the query it answers, so "is this stale?"
  // is derived rather than tracked in a second piece of state.
  const [loaded, setLoaded] = useState<{
    key: string;
    data: AnalyticsResult | null;
    error: string | null;
  }>({ key: "", data: initialAnalytics, error: null });

  const queryKey = new URLSearchParams({
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    ...Object.fromEntries(activeIdentity.map(({ key }) => [key, identity[key]])),
    ...(subs !== "parents" ? { subs } : {}),
  }).toString();

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/master-options", { signal: controller.signal });
        const body: ApiResult<{ options: { id: string; code: string }[] }> = await response.json();
        if (body.success) {
          setCodeById(new Map(body.data.options.map((option) => [option.id, option.code])));
        }
      } catch (caught) {
        // The chips fall back to the kind name; nothing else depends on this.
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setRange({ from, to }), RANGE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [from, to]);

  useEffect(() => {
    // The server already supplied the default window; only a changed range
    // needs a request. The key is set on failure too, so an error cannot loop.
    if (loaded.key === queryKey) return;

    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/analytics?${queryKey}`, { signal: controller.signal });
        const body: ApiResult<AnalyticsResult> = await response.json();
        setLoaded(
          body.success
            ? { key: queryKey, data: body.data, error: null }
            : { key: queryKey, data: null, error: body.error }
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({ key: queryKey, data: null, error: loadError });
      }
    })();

    return () => controller.abort();
  }, [queryKey, loaded.key, loadError]);

  /**
   * The quiet refresh: same window, same filters, fetched again on a timer or
   * the refresh button. Unlike a filter change it does not dim the page, and
   * a failure leaves the figures already on screen alone -- the next tick
   * will try again. Skipped while a filter change is still loading, since
   * that request is about to answer anyway.
   */
  const background = useRef<AbortController | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  async function refreshNow() {
    if (loaded.key !== queryKey || background.current) return;
    const key = queryKey;
    const controller = new AbortController();
    background.current = controller;
    setIsPolling(true);
    try {
      const response = await fetch(`/api/analytics?${key}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const body: ApiResult<AnalyticsResult> = await response.json();
      if (body.success) {
        // Only if the filters have not moved on while this was in flight.
        setLoaded((previous) =>
          previous.key === key ? { key, data: body.data, error: null } : previous
        );
      }
    } catch {
      // Offline for a moment, or aborted: keep what is on screen.
    } finally {
      background.current = null;
      setIsPolling(false);
    }
  }
  useVisibleInterval(() => void refreshNow(), AUTO_REFRESH_MS);
  useEffect(() => () => background.current?.abort(), []);

  const [isDownloading, setIsDownloading] = useState(false);
  async function downloadReport() {
    setIsDownloading(true);
    const message = await downloadFromApi(
      `/api/analytics/report?${queryKey}`,
      "lab-summary.xlsx"
    );
    setIsDownloading(false);
    if (message) toast(message, "error");
  }

  const data = loaded.data;
  const error = loaded.error;

  // The previous answer stays on screen while a new one is fetched, which is
  // right — but with nothing saying so, changing a filter looked like nothing
  // happened. Derived from the key rather than tracked in more state.
  const isRefreshing = loaded.key !== queryKey && !error;

  const hasFilter = activeIdentity.length > 0 || subs !== "parents";

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

  function clearIdentity(key?: IdentityKey) {
    setIdentity((previous) =>
      key
        ? { ...previous, [key]: "ALL" }
        : (Object.fromEntries(IDENTITY_FILTERS.map((filter) => [filter.key, "ALL"])) as Record<
            IdentityKey,
            string
          >)
    );
  }

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
      <div className="flex flex-wrap items-end gap-3" data-tour="dashboard-range">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="from">{t("rangeFrom")}</Label>
          <Input
            id="from"
            type="date"
            className="w-44"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="to">{t("rangeTo")}</Label>
          <Input
            id="to"
            type="date"
            className="w-44"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          {/* Spacer label so the button sits on the same baseline as the dates. */}
          <span aria-hidden className="text-sm leading-none">&nbsp;</span>
          <Button
            variant="outline"
            className="gap-2"
            aria-expanded={showFilters} data-tour="dashboard-filters"
            onClick={() => setShowFilters((open) => !open)}
          >
            <IoFunnelOutline className="size-4" />
            {t("filters")}
            {activeIdentity.length + (subs !== "parents" ? 1 : 0) > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {activeIdentity.length + (subs !== "parents" ? 1 : 0)}
              </span>
            ) : null}
            <IoChevronDown
              className={cn("size-4 transition-transform", showFilters && "rotate-180")}
            />
          </Button>
        </div>
        {from || to || hasFilter ? (
          <Button
            variant="outline"
            onClick={() => {
              setFrom("");
              setTo("");
              clearIdentity();
              setSubs("parents");
            }}
          >
            {t("rangeReset", { days: DEFAULT_WINDOW_DAYS })}
          </Button>
        ) : null}

        {/* How fresh the figures are, and the ways to act on them. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {data?.generatedAt ? (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {t("lastUpdated", { time: formatSessionTime(data.generatedAt) })}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-label={t("refresh")} data-tour="dashboard-refresh"
            title={t("refresh")}
            disabled={isPolling || isRefreshing}
            onClick={() => void refreshNow()}
          >
            <IoReloadOutline className={cn("size-4", isPolling && "animate-spin")} />
          </Button>
          <Link
            href="/tv" data-tour="dashboard-tv"
            target="_blank"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <IoTvOutline className="size-4" />
            {t("tvMode")}
          </Link>
          {canDownloadReport ? (
            <Button
              variant="outline"
              className="gap-2"
              disabled={isDownloading || isRefreshing}
              onClick={() => void downloadReport()} data-tour="dashboard-report"
            >
              {isDownloading ? (
                <IoReloadOutline className="size-4 animate-spin" />
              ) : (
                <IoDownloadOutline className="size-4" />
              )}
              {t("downloadReport")}
            </Button>
          ) : null}
        </div>
      </div>

      {showFilters ? (
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-5" data-tour="dashboard-filter-panel">
          {IDENTITY_FILTERS.map(({ key, kind }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`filter-${key}`}>{tMaster(`kind.${kind}`)}</Label>
              <MasterFilter
                kind={kind}
                className="w-full"
                value={identity[key]}
                onChange={(value) =>
                  setIdentity((previous) => ({ ...previous, [key]: value ?? "ALL" }))
                }
              />
            </div>
          ))}
          {/* Counts barcodes as before; only the result figures follow it. */}
          <SubFilterSelect id="filter-subs" className="w-full" value={subs} onChange={setSubs} />
        </div>
      ) : null}

      {/* A filter behind a button changes every figure on this page. Leaving it
          invisible is how a report gets misread, so what is applied stays on
          screen whether the panel is open or not. */}
      {activeChips.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => clearIdentity(chip.key)}
                className="flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-2.5 pr-2 text-xs transition-colors hover:bg-muted"
              >
                <span className="text-muted-foreground">{chip.label}:</span>
                <span className="font-medium">{chip.code}</span>
                <IoClose aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="sr-only">{t("removeFilter", { name: chip.label })}</span>
              </button>
            </li>
          ))}
        </ul>
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
            <>
              <Card id="needs-attention" data-tour="dashboard-attention" className="scroll-mt-6">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {data.overdueSamples.length > 0 ? (
                      <IoWarningOutline className="size-4 text-destructive" />
                    ) : null}
                    {t("needsAttention.title", { count: data.overdueSamples.length })}
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowTable((previous) => !previous)}
                  >
                    <IoReorderFourOutline className="size-4" />
                    {showTable ? t("needsAttention.hideTable") : t("needsAttention.showTable")}
                  </Button>
                </CardHeader>
                <CardContent>
                  {data.overdueSamples.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      {t("needsAttention.empty")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{tSamples("barcodeCode")}</TableHead>
                            <TableHead>{tSamples("labCode")}</TableHead>
                            {/* Which sample, not just which barcode: this is the
                                table for chasing specific ones down. */}
                            <TableHead>{tDatabase("sampleIdent")}</TableHead>
                            <TableHead>{t("needsAttention.stuckIn")}</TableHead>
                            <TableHead className="text-right">{t("needsAttention.hours")}</TableHead>
                            <TableHead className="text-right">{t("needsAttention.sla")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.overdueSamples.slice(0, 20).map((sample) => (
                            <TableRow key={sample.sampleCode}>
                              <TableCell className="font-medium">
                                <Link
                                  href={`/samples/${encodeURIComponent(sample.sampleCode)}`}
                                  className="text-primary hover:underline"
                                >
                                  {sample.sampleCode}
                                </Link>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {sample.labCode ?? tCommon("empty")}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {sample.sampleIdent ?? (
                                  <span className="font-sans text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {stageLabel(tStages, sample.stageKey, sample.stageName)}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums text-destructive">
                                {sample.hoursInStage}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {sample.slaHours}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {showTable ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("chartData.title")}</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("chartData.shiftDay")}</TableHead>
                          <TableHead className="text-right">{t("throughput.registered")}</TableHead>
                          <TableHead className="text-right">{t("throughput.completed")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.throughput.map((row) => (
                          <TableRow key={row.shiftDate}>
                            <TableCell>{row.shiftDate}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.created}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.completed}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : null}
            </>
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
