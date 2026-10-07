"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
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
import { usePendingDisplay } from "@/hooks/use-pending-display";
import { SortableHead } from "@/components/ui/sortable-head";
import { StatusBadge } from "@/components/samples/status-badge";
import { TablePagination } from "@/components/shared/table-toolbar";
import { ExportDialog } from "@/components/shared/export-dialog";
import { useTableParams } from "@/hooks/use-table-params";
import { downloadFromApi } from "@/lib/download";
import type { ApiResult, PaginationDTO, SampleListItemDTO, StageDTO } from "@/types";
import { stageLabel } from "@/lib/stages";
import { IoSearchOutline } from "react-icons/io5";
import { InlineNotice } from "@/components/ui/inline-notice";

const STATUS_VALUES = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"] as const;

interface SamplesTableProps {
  /** Exporting the full sample report: manageDashboard in permissions.ts. */
  canExport: boolean;
}

export function SamplesTable({ canExport }: SamplesTableProps) {
  const t = useTranslations("samples");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const tDatabase = useTranslations("database");
  const format = useFormatter();
  const loadError = tCommon("loadError");
  const { get, setParams, toggleSort } = useTableParams();

  const search = get("search", "");
  const status = get("status", "ALL");
  const stageId = get("stageId", "ALL");
  const sort = get("sort", "updatedAt");
  const order = get("order", "desc");
  const page = get("page", "1");
  const pageSize = get("pageSize", "10");

  const [searchInput, setSearchInput] = useState(search);
  const [stages, setStages] = useState<StageDTO[]>([]);
  const [result, setResult] = useState<{
    key: string;
    samples: SampleListItemDTO[];
    pagination: PaginationDTO | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Base UI shows the raw value unless it is given a value-to-label map.
  const statusLabels = Object.fromEntries(
    STATUS_VALUES.map((value) => [
      value,
      value === "ALL" ? t("allStatuses") : t(`status.${value}`),
    ])
  );
  const stageLabels: Record<string, string> = {
    ALL: t("allStages"),
    ...Object.fromEntries(
      stages.map((stage) => [stage.id, stageLabel(tStages, stage.key, stage.name)])
    ),
  };

  // Typing updates the URL only after a pause, so the history stays usable.
  useEffect(() => {
    if (searchInput === search) return;
    const timeout = setTimeout(() => setParams({ search: searchInput }), 300);
    return () => clearTimeout(timeout);
  }, [searchInput, search, setParams]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stages", { signal: controller.signal })
      .then((response) => response.json())
      .then((result: ApiResult<StageDTO[]>) => {
        if (result.success) setStages(result.data);
      })
      .catch(() => {
        // The stage filter is optional; the table still works without it.
      });
    return () => controller.abort();
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "ALL") params.set("status", status);
    if (stageId !== "ALL") params.set("stageId", stageId);
    params.set("sort", sort);
    params.set("order", order);
    return params;
  }, [search, status, stageId, sort, order]);

  const queryKey = (() => {
    const params = buildParams();
    params.set("page", page);
    params.set("pageSize", pageSize);
    return params.toString();
  })();

  // Loading is derived from "the answer we hold is for an older query", so this
  // effect never has to set state synchronously.
  const isLoading = result?.key !== queryKey;
  const showRefreshing = usePendingDisplay(isLoading);
  const samples = result?.samples ?? [];
  const pagination = result?.pagination ?? null;

  useEffect(() => {
    // Aborting a superseded request stops the server finishing a query whose
    // answer is already unwanted, and frees the connection for the live one.
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/samples?${queryKey}`, { signal: controller.signal });
        const body: ApiResult<{ samples: SampleListItemDTO[]; pagination: PaginationDTO }> =
          await response.json();

        if (!body.success) {
          setError(body.error);
          setResult({ key: queryKey, samples: [], pagination: null });
          return;
        }
        setError(null);
        setResult({ key: queryKey, samples: body.data.samples, pagination: body.data.pagination });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError(loadError);
        setResult({ key: queryKey, samples: [], pagination: null });
      }
    })();

    return () => controller.abort();
  }, [queryKey, loadError]);

  async function handleExport(format: "xlsx" | "csv", columns: string[]) {
    setError(null);
    const params = buildParams();
    params.set("format", format);
    params.set("columns", columns.join(","));

    const message = await downloadFromApi(
      `/api/samples/export?${params.toString()}`,
      `nickel-sample-report.${format}`
    );
    if (message) {
      setError(message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
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
          <Select
            value={status}
            items={statusLabels}
            onValueChange={(value) => setParams({ status: value === "ALL" ? null : value })}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label={t("allStatuses")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value === "ALL" ? t("allStatuses") : t(`status.${value}`)}
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
        </div>
        {canExport ? <ExportDialog kind="samples" onExport={handleExport} /> : null}
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <TableRefreshing isRefreshing={showRefreshing}>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label={t("barcodeCode")}
                field="sampleCode"
                sort={sort}
                order={order}
                onSort={(field) => toggleSort(field, sort, order)}
              />
              {/* What the row is, not just its barcode. The batch name used to
                  serve this and went with batches. */}
              <TableHead>{tDatabase("sampleIdent")}</TableHead>
              <TableHead>{t("labCode")}</TableHead>
              <TableHead>{t("currentStage")}</TableHead>
              <SortableHead
                label={t("lastUpdated")}
                field="updatedAt"
                sort={sort}
                order={order}
                onSort={(field) => toggleSort(field, sort, order)}
              />
              <SortableHead
                label={tCommon("status")}
                field="status"
                sort={sort}
                order={order}
                onSort={(field) => toggleSort(field, sort, order)}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && samples.length === 0 ? (
              <TableSkeleton rows={Math.min(Number(pageSize) || 10, 10)} columns={6} />
            ) : samples.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              samples.map((sample, rowIndex) => (
                <AnimatedTableRow key={sample.id} index={rowIndex}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/samples/${encodeURIComponent(sample.sampleCode)}`}
                      className="text-primary hover:underline"
                    >
                      {sample.sampleCode}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {sample.sampleIdent ?? <span className="font-sans text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {sample.labCode ?? <span className="font-sans text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {sample.currentStage
                      ? stageLabel(tStages, sample.currentStage.key, sample.currentStage.name)
                      : t("notStarted")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format.dateTime(new Date(sample.updatedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sample.status} />
                  </TableCell>
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
          shown={samples.length}
          noun={t("noun")}
          pageSize={pageSize}
          onPageSizeChange={(value) => setParams({ pageSize: value === "10" ? null : value })}
          onPageChange={(next) => setParams({ page: next === 1 ? null : String(next) })}
        />
      ) : null}
    </div>
  );
}
