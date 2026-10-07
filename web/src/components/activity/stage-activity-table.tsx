"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimatedTableRow } from "@/components/ui/animated-table-row";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { TableRefreshing } from "@/components/ui/table-refreshing";
import { InlineNotice } from "@/components/ui/inline-notice";
import { ExportMenu, TablePagination } from "@/components/shared/table-toolbar";
import { usePendingDisplay } from "@/hooks/use-pending-display";
import { useTableParams } from "@/hooks/use-table-params";
import { downloadFromApi } from "@/lib/download";
import { stageLabel } from "@/lib/stages";
import type { ApiResult, PaginationDTO, StageDTO } from "@/types";
import { IoSearchOutline } from "react-icons/io5";

interface ActivityLog {
  id: string;
  scannedAt: string;
  isCorrection: boolean;
  notes: string | null;
  stageId: string;
  stageKey: string;
  stageName: string;
  operatorId: string;
  operatorName: string;
  sampleId: string;
  sampleCode: string;
}

interface OperatorTotal {
  operatorId: string;
  operatorName: string;
  total: number;
  byStage: Record<string, number>;
}

interface ActivityResponse {
  logs: ActivityLog[];
  summary: OperatorTotal[];
  operators: { id: string; name: string }[];
  pagination: PaginationDTO;
}

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
        const response = await fetch(`/api/stage-activity?${queryKey}`, {
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
      {/*
        Who did how much, counted across everything the filters match rather
        than across this page. It deliberately ignores the person filter:
        picking a name narrows the list below, and if the summary narrowed too
        it would collapse to one figure and take away the comparison that made
        you click in the first place.
      */}
      <Card data-tour="activity-summary">
        <CardHeader>
          <CardTitle className="text-base">{t("summaryTitle")}</CardTitle>
          <CardDescription>{t("summaryHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("summaryEmpty")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {summary.map((entry) => {
                const isPicked = entry.operatorId === operatorId;
                return (
                  <li key={entry.operatorId}>
                    <button
                      type="button"
                      aria-pressed={isPicked}
                      onClick={() => setParams({ operatorId: isPicked ? null : entry.operatorId })}
                      className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                        isPicked
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">{entry.operatorName}</span>
                      <span className="tabular-nums opacity-80">{entry.total}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div data-tour="activity-filters" className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative max-w-sm flex-1">
            <IoSearchOutline className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("searchPlaceholder")}
              placeholder={t("searchPlaceholder")}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="pl-8"
            />
          </div>

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
                        href={`/samples/${encodeURIComponent(log.sampleCode)}`}
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
