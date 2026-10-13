"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/core/components/ui/badge";
import { Input } from "@/core/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { AnimatedTableRow } from "@/core/components/ui/animated-table-row";
import { TableSkeleton } from "@/core/components/ui/table-skeleton";
import { TableRefreshing } from "@/core/components/ui/table-refreshing";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { ExportMenu, TablePagination } from "@/core/components/table/table-toolbar";
import { usePendingDisplay } from "@/core/hooks/use-pending-display";
import { useTableParams } from "@/core/hooks/use-table-params";
import { downloadFromApi } from "@/core/lib/http/download";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import type { ApiResult } from "@/core/types";
import type { StageDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import { samplePath } from "@/modules/lab/lib/samples/sample-ident";
import { SearchInput } from "@/core/components/form/search-input";
import { FilterChips } from "@/core/components/table/filter-chips";
import type { ActivityResponse } from "@/modules/lab/components/activity/stage-activity-types";

const CORRECTION_MODES = ["ALL", "only", "exclude"] as const;
const COLUMN_COUNT = 6;

/** The lab reads every timestamp on its own clock, not the browser's. */
const LAB_TIMEZONE = "Asia/Makassar";

/** Only what a filter row and a stage label need; not the whole DTO. */
type StageOption = Pick<StageDTO, "id" | "key" | "name">;

export function StageActivityTable({ stages }: { stages: StageOption[] }) {
  const t = useTranslations("stageActivity");
  const tStages = useTranslations("stages");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const loadError = tCommon("loadError");
  const { get, setParams } = useTableParams();

  const search = get("search", "");
  const operatorId = get("operatorId", "ALL");
  const stageId = get("stageId", "ALL");
  const shiftDate = get("shiftDate", "");
  const corrections = get("corrections", "ALL");
  const page = get("page", "1");
  const pageSize = get("pageSize", "10");

  const [searchInput, setSearchInput] = useState(search);
  const [result, setResult] = useState<{ key: string; data: ActivityResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchInput === search) return;
    const timeout = setTimeout(() => setParams({ search: searchInput }), 300);
    return () => clearTimeout(timeout);
  }, [searchInput, search, setParams]);

  /** The filters without paging: the export is handed exactly these. */
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (operatorId !== "ALL") params.set("operatorId", operatorId);
    if (stageId !== "ALL") params.set("stageId", stageId);
    if (shiftDate) params.set("shiftDate", shiftDate);
    if (corrections !== "ALL") params.set("corrections", corrections);
    return params;
  }, [search, operatorId, stageId, shiftDate, corrections]);

  const queryKey = (() => {
    const params = buildParams();
    params.set("page", page);
    params.set("pageSize", pageSize);
    return params.toString();
  })();

  // Loading is derived from "the answer we hold is for an older query", the
  // same way the other tables do it, so the rows in hand stay on screen while
  // the next set is fetched.
  const isLoading = result?.key !== queryKey;
  const showRefreshing = usePendingDisplay(isLoading);
  const logs = result?.data.logs ?? [];
  const summary = result?.data.summary ?? [];
  const operators = result?.data.operators ?? [];
  const pagination = result?.data.pagination ?? null;

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/stage-activity?${queryKey}`), {
          signal: controller.signal,
        });
        const body: ApiResult<ActivityResponse> = await response.json();

        if (!body.success) {
          setError(body.error);
          return;
        }
        setError(null);
        setResult({ key: queryKey, data: body.data });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(loadError);
      }
    })();

    return () => controller.abort();
  }, [queryKey, loadError]);

  async function handleExport(exportFormat: "xlsx" | "csv") {
    setError(null);
    const params = buildParams();
    params.set("format", exportFormat);

    const message = await downloadFromApi(
      `/api/stage-activity/export?${params.toString()}`,
      `stage-activity.${exportFormat}`
    );
    if (message) setError(message);
  }

  const operatorLabels: Record<string, string> = {
    ALL: t("allOperators"),
    ...Object.fromEntries(operators.map((operator) => [operator.id, operator.name])),
  };
  const stageLabels: Record<string, string> = {
    ALL: t("allStages"),
    ...Object.fromEntries(
      stages.map((stage) => [stage.id, stageLabel(tStages, stage.key, stage.name)])
    ),
  };
  const correctionLabels: Record<string, string> = {
    ALL: t("correctionsAll"),
    only: t("correctionsOnly"),
    exclude: t("correctionsExclude"),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Who did how much, across everything the filters match. */}
      <FilterChips
        tourId="activity-summary"
        title={t("summaryTitle")}
        hint={t("summaryHint")}
        emptyText={t("summaryEmpty")}
        items={summary.map((entry) => ({ key: entry.operatorId, label: entry.operatorName, total: entry.total }))}
        picked={operatorId}
        onPick={(id) => setParams({ operatorId: id })}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div data-tour="activity-filters" className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder={t("searchPlaceholder")} />

          <Input
            type="date"
            aria-label={t("shiftDate")}
            value={shiftDate}
            onChange={(event) => setParams({ shiftDate: event.target.value || null })}
            className="w-full sm:w-44"
          />

          <Select
            value={operatorId}
            items={operatorLabels}
            onValueChange={(value) => setParams({ operatorId: value === "ALL" ? null : value })}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label={t("allOperators")}>
              <SelectValue>{(value) => operatorLabels[value as string] ?? ""}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allOperators")}</SelectItem>
              {operators.map((operator) => (
                <SelectItem key={operator.id} value={operator.id}>
                  {operator.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={stageId}
            items={stageLabels}
            onValueChange={(value) => setParams({ stageId: value === "ALL" ? null : value })}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label={t("allStages")}>
              <SelectValue>{(value) => stageLabels[value as string] ?? ""}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allStages")}</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stageLabel(tStages, stage.key, stage.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={corrections}
            items={correctionLabels}
            onValueChange={(value) => setParams({ corrections: value === "ALL" ? null : value })}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label={t("corrections")}>
              <SelectValue>{(value) => correctionLabels[value as string] ?? ""}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CORRECTION_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {correctionLabels[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ExportMenu tourId="activity-export" onExport={handleExport} />
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <TableRefreshing isRefreshing={showRefreshing}>
        <div data-tour="activity-table" className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">{t("recordedAt")}</TableHead>
                <TableHead className="w-44">{t("sample")}</TableHead>
                <TableHead className="w-40">{t("stage")}</TableHead>
                <TableHead className="w-44">{t("by")}</TableHead>
                <TableHead className="w-24">{t("isCorrection")}</TableHead>
                <TableHead>{t("notes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && logs.length === 0 ? (
                <TableSkeleton rows={Math.min(Number(pageSize) || 10, 10)} columns={COLUMN_COUNT} />
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMN_COUNT}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log, rowIndex) => (
                  <AnimatedTableRow key={log.id} index={rowIndex}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {format.dateTime(new Date(log.scannedAt), {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: LAB_TIMEZONE,
                      })}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={samplePath(log.sampleCode)}
                        className="font-mono text-sm font-medium text-primary hover:underline"
                      >
                        {log.sampleCode}
                      </Link>
                    </TableCell>
                    <TableCell>{stageLabel(tStages, log.stageKey, log.stageName)}</TableCell>
                    <TableCell className="font-medium">{log.operatorName}</TableCell>
                    <TableCell>
                      {log.isCorrection ? (
                        <Badge variant="destructive">{t("isCorrection")}</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.notes ?? "—"}</TableCell>
                  </AnimatedTableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TableRefreshing>

      {pagination ? (
        <TablePagination
          pagination={pagination}
          shown={logs.length}
          noun={t("noun")}
          pageSize={pageSize}
          onPageSizeChange={(value) => setParams({ pageSize: value === "10" ? null : value })}
          onPageChange={(next) => setParams({ page: next === 1 ? null : String(next) })}
        />
      ) : null}
    </div>
  );
}
