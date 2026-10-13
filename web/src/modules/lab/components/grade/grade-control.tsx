"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { ChartBox, ChartCard } from "@/modules/lab/components/dashboard/chart-kit";
import { baseOptions } from "@/modules/lab/components/dashboard/dashboard-charts";
import { useTheme } from "@/core/components/layout/theme-provider";
import { useReducedMotion } from "@/core/lib/ui/use-reduced-motion";
import { BAR_BASE_EDGE, BAR_MAX_SIZE, BAR_RADIUS, SERIES, readChartChrome } from "@/core/lib/ui/chart-theme";
import { valueLabelPlugin } from "@/core/lib/ui/chart-value-labels";
import { useTableParams } from "@/core/hooks/use-table-params";
import { SubFilterSelect } from "@/modules/lab/components/shared/sub-filter-select";
import { SUB_FILTERS, type SubFilter } from "@/modules/lab/validation/records";
import { downloadFromApi } from "@/core/lib/http/download";
import { toast } from "@/core/components/ui/toast";
import { DEFAULT_WINDOW_DAYS } from "@/modules/lab/lib/analytics/analytics-range";
import {
  GRADE_GROUP_KEYS,
  NO_CODE,
  formatGradeGroups,
  parseGradeGroups,
  type GradeGroup,
} from "@/modules/lab/lib/analytics/grade-groups";
import type { GradeControlResult, GradeRow } from "@/modules/lab/lib/analytics/grade-control";
import { cn } from "@/core/lib/utils";
import type { ApiResult } from "@/core/types";
import { IoDownloadOutline, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";
import { GradeTable } from "@/modules/lab/components/grade/grade-table";

/** How many bars the chart draws; the table below still lists every row. */
const MAX_BARS = 30;

/**
 * Average grades per pit, SIR, place, rock type or non-prod code, or any
 * combination of them: which ground is giving what. Same window as the
 * dashboard, filters in the URL so a view can be shared, and the table as a
 * workbook.
 */
export function GradeControlView() {
  const t = useTranslations("grade");
  const tCommon = useTranslations("common");
  const { get, setParams } = useTableParams();
  const from = get("from", "");
  const to = get("to", "");
  const groupBy = parseGradeGroups(get("groupBy", "pit"));
  /** The samples alone unless sub-samples are asked for; kept in the URL like the rest. */
  const rawSubs = get("subs", "parents");
  const subs: SubFilter = (SUB_FILTERS as readonly string[]).includes(rawSubs) ? (rawSubs as SubFilter) : "parents";

  /** Adds or removes one dimension; the last one left cannot be removed. */
  function toggleGroup(group: GradeGroup) {
    const next = groupBy.includes(group)
      ? groupBy.filter((held) => held !== group)
      : [...groupBy, group];
    if (next.length === 0) return;
    const value = formatGradeGroups(next);
    setParams({ groupBy: value === "pit" ? null : value });
  }

  const query = new URLSearchParams({
    groupBy: formatGradeGroups(groupBy),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(subs !== "parents" ? { subs } : {}),
  }).toString();

  const [loaded, setLoaded] = useState<{
    key: string;
    data: GradeControlResult | null;
    error: string | null;
  }>({ key: "", data: null, error: null });
  const [isDownloading, setIsDownloading] = useState(false);
  const loadError = tCommon("loadError");

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/grade-control?${query}`), { signal: controller.signal });
        const body: ApiResult<GradeControlResult> = await response.json();
        setLoaded(
          body.success
            ? { key: query, data: body.data, error: null }
            : { key: query, data: null, error: body.error }
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLoaded({ key: query, data: null, error: loadError });
      }
    })();
    return () => controller.abort();
  }, [query, loadError]);

  const isLoading = loaded.key !== query;
  const data = loaded.data;
  const groupLabels = Object.fromEntries(GRADE_GROUP_KEYS.map((key) => [key, t(`groups.${key}`)]));

  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const chrome = useMemo(() => readChartChrome(theme), [theme]);
  const options = useMemo<ChartOptions<"bar">>(
    () => ({ ...baseOptions(chrome, true, reducedMotion), indexAxis: "y" }),
    [chrome, reducedMotion]
  );
  const labelPlugin = useMemo(
    () => valueLabelPlugin({ axis: "y", suffix: "%", colour: chrome.axisText }),
    [chrome]
  );

  // The dimensions of the rows on screen, which during a reload are the
  // previous answer's, not the buttons' new state.
  const shownGroups = data?.groupBy ?? groupBy;
  const charted = (data?.rows ?? []).filter((row) => row.avg.ni !== null).slice(0, MAX_BARS);
  const codeOf = (row: GradeRow, group: GradeGroup) => {
    const code = row.codes[group];
    return !code || code === NO_CODE ? t("none") : code;
  };
  const nameOf = (row: GradeRow) => shownGroups.map((group) => codeOf(row, group)).join(" · ");

  async function download() {
    setIsDownloading(true);
    const message = await downloadFromApi(`/api/grade-control?${query}&format=xlsx`, "conclusion.xlsx");
    setIsDownloading(false);
    if (message) toast(message, "error");
  }

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="grade-range" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grade-from">{t("from")}</Label>
          <Input
            id="grade-from"
            type="date"
            className="w-44"
            value={from}
            onChange={(event) => setParams({ from: event.target.value || null })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="grade-to">{t("to")}</Label>
          <Input
            id="grade-to"
            type="date"
            className="w-44"
            value={to}
            onChange={(event) => setParams({ to: event.target.value || null })}
          />
        </div>
        <SubFilterSelect
          id="grade-subs"
          value={subs}
          onChange={(value) => setParams({ subs: value === "parents" ? null : value })}
        />
        {/* Any combination: Pit alone, or Pit + Ore class, and so on. */}
        <div className="flex flex-col gap-1.5">
          <span id="grade-group-label" className="text-sm font-medium leading-none">
            {t("groupBy")}
          </span>
          <div
            data-tour="grade-group"
            role="group"
            aria-labelledby="grade-group-label"
            className="flex flex-wrap gap-1 rounded-xl bg-muted p-1"
          >
            {GRADE_GROUP_KEYS.map((key) => {
              const active = groupBy.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  disabled={active && groupBy.length === 1}
                  onClick={() => toggleGroup(key)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-default",
                    active
                      ? "bg-background font-medium text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {groupLabels[key]}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          variant="outline"
          className="ml-auto gap-2"
          data-tour="grade-download"
          disabled={isDownloading || isLoading || !data}
          onClick={() => void download()}
        >
          {isDownloading ? (
            <IoReloadOutline className="size-4 animate-spin" />
          ) : (
            <IoDownloadOutline className="size-4" />
          )}
          {t("download")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {data
          ? t("range", { from: data.range.from.slice(0, 10), to: data.range.to.slice(0, 10) })
          : t("defaultRange", { days: DEFAULT_WINDOW_DAYS })}
        {" · "}
        {t("averagesNote")}
      </p>

      {loaded.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{loaded.error}</p>
      ) : null}

      {!data && isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <IoReloadOutline className="size-6 animate-spin" />
        </div>
      ) : data ? (
        <div className={isLoading ? "pointer-events-none opacity-60 transition-opacity" : undefined}>
          <div className="flex flex-col gap-4">
            <div data-tour="grade-chart">
            <ChartCard
              title={t("chartTitle", { group: shownGroups.map((group) => groupLabels[group]).join(" · ") })}
              description={t("chartDescription")}
              isEmpty={charted.length === 0}
              emptyMessage={t("empty")}
            >
              <ChartBox className={charted.length > 16 ? "h-[640px]" : charted.length > 8 ? "h-[420px]" : "h-[280px]"}>
                <Bar
                  options={options}
                  plugins={[labelPlugin]}
                  data={{
                    labels: charted.map(nameOf),
                    datasets: [
                      {
                        label: "Ni (%)",
                        data: charted.map((row) => row.avg.ni ?? 0),
                        backgroundColor: SERIES.primary,
                        borderRadius: BAR_RADIUS,
                        borderSkipped: BAR_BASE_EDGE,
                        maxBarThickness: BAR_MAX_SIZE,
                      },
                    ],
                  }}
                />
              </ChartBox>
            </ChartCard>
            </div>

            <GradeTable rows={data.rows} shownGroups={shownGroups} groupLabels={groupLabels} codeOf={codeOf} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
