"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnimatedTableRow } from "@/components/ui/animated-table-row";
import { InlineNotice } from "@/components/ui/inline-notice";
import { DrillHoleDialog, type DrillHoleDialogTarget } from "@/components/drilling/drill-hole-dialog";
import { DeleteDrillHoleDialog } from "@/components/drilling/delete-drill-hole-dialog";
import { DRILL_HOLE_STATUSES } from "@/lib/drill-hole";
import { withBasePath } from "@/lib/base-path";
import type { ApiResult, DrillHoleDTO, DrillHoleStatus, PaginationDTO } from "@/types";
import {
  IoAddOutline,
  IoChevronBack,
  IoChevronForward,
  IoPencilOutline,
  IoReloadOutline,
  IoSearchOutline,
  IoTrashOutline,
} from "react-icons/io5";

const PAGE_SIZE = 20;
const ALL = "ALL";

/** One colour per status, so a list of holes reads at a glance. */
export const STATUS_VARIANT: Record<DrillHoleStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PLANNED: "outline",
  ONGOING: "default",
  COMPLETED: "secondary",
  ABANDONED: "destructive",
};

/**
 * The drill holes: search by hole ID or area, filter by status, add, edit and
 * remove. Deliberately plain -- the detailed drilling features come later.
 */
export function DrillHolesTable() {
  const t = useTranslations("drilling");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const loadError = tCommon("loadError");
  const [rows, setRows] = useState<DrillHoleDTO[]>([]);
  const [pagination, setPagination] = useState<PaginationDTO | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DrillHoleStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<DrillHoleDialogTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrillHoleDTO | null>(null);

  const fetchRows = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (search) params.set("search", search);
        if (status !== ALL) params.set("status", status);

        const response = await fetch(withBasePath(`/api/drill-holes?${params.toString()}`), { signal });
        const result: ApiResult<{ drillHoles: DrillHoleDTO[]; pagination: PaginationDTO }> =
          await response.json();

        if (!result.success) {
          setError(result.error);
          return;
        }
        setRows(result.data.drillHoles);
        setPagination(result.data.pagination);
      } catch (caught) {
        // An aborted request is a superseded one; leave the state alone.
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(loadError);
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [page, search, status, loadError]
  );

  useEffect(() => {
    // Debounced for typing, and aborted so a slow answer to an older search
    // cannot land after a newer one.
    const controller = new AbortController();
    const timeout = setTimeout(() => fetchRows(controller.signal), 300);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [fetchRows]);

  const statusLabel = (value: DrillHoleStatus) => t(`status.${value}`);
  const number = (value: number | null, digits = 2) =>
    value === null ? tCommon("empty") : format.number(value, { maximumFractionDigits: digits });
  const date = (value: string | null) =>
    value === null ? tCommon("empty") : format.dateTime(new Date(`${value}T00:00:00`), { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1">
            <IoSearchOutline className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("searchPlaceholder")}
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
          <Select
            value={status}
            items={{ [ALL]: t("allStatuses"), ...Object.fromEntries(DRILL_HOLE_STATUSES.map((s) => [s, statusLabel(s)])) }}
            onValueChange={(value) => {
              setStatus(value as DrillHoleStatus | typeof ALL);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label={t("fields.status")} className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
              {DRILL_HOLE_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {statusLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="gap-2" onClick={() => setTarget("new")}>
          <IoAddOutline className="size-4" />
          {t("add")}
        </Button>
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.holeId")}</TableHead>
              <TableHead>{t("fields.area")}</TableHead>
              <TableHead>{t("fields.status")}</TableHead>
              <TableHead className="text-right">{t("columns.coordinates")}</TableHead>
              <TableHead className="text-right">{t("columns.orientation")}</TableHead>
              <TableHead className="text-right">{t("fields.totalDepth")}</TableHead>
              <TableHead>{t("columns.period")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  <IoReloadOutline className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {search || status !== ALL ? t("emptyFiltered") : t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, rowIndex) => (
                <AnimatedTableRow key={row.id} index={rowIndex}>
                  <TableCell className="font-mono font-medium">{row.holeId}</TableCell>
                  <TableCell>{row.area ?? tCommon("empty")}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status]}>{statusLabel(row.status)}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-xs">
                    <div>E {number(row.easting, 3)}</div>
                    <div>N {number(row.northing, 3)}</div>
                    <div className="text-muted-foreground">Z {number(row.elevation)}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-xs">
                    <div>
                      {t("columns.azimuthShort")} {number(row.azimuth)}°
                    </div>
                    <div>
                      {t("columns.dipShort")} {number(row.dip)}°
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono">
                    {row.totalDepth === null ? tCommon("empty") : `${number(row.totalDepth)} m`}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    <div>{date(row.startDate)}</div>
                    <div className="text-muted-foreground">{date(row.endDate)}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTarget(row)}>
                        <IoPencilOutline className="size-3.5" />
                        {tCommon("edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={t("delete.label", { holeId: row.holeId })}
                        onClick={() => setDeleteTarget(row)}
                      >
                        <IoTrashOutline className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </AnimatedTableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>{tCommon("showing", { shown: rows.length, total: pagination.total, noun: t("noun") })}</p>
          {pagination.totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={tCommon("previousPage")}
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => current - 1)}
              >
                <IoChevronBack className="size-4" />
              </Button>
              <span>{tCommon("pageOf", { page: pagination.page, total: pagination.totalPages })}</span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={tCommon("nextPage")}
                disabled={page >= pagination.totalPages || isLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                <IoChevronForward className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <DrillHoleDialog
        target={target}
        onClose={() => setTarget(null)}
        onSaved={(saved, isNew) => {
          setRows((previous) =>
            isNew ? [saved, ...previous] : previous.map((row) => (row.id === saved.id ? saved : row))
          );
          if (isNew) setPagination((current) => (current ? { ...current, total: current.total + 1 } : current));
        }}
      />

      <DeleteDrillHoleDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          setRows((previous) => previous.filter((row) => row.id !== id));
          setPagination((current) => (current ? { ...current, total: Math.max(0, current.total - 1) } : current));
        }}
      />
    </div>
  );
}
