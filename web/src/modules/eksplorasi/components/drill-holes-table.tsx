"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { SearchInput } from "@/core/components/form/search-input";
import { ExportMenu, TablePagination } from "@/core/components/table/table-toolbar";
import { useApiList } from "@/core/hooks/use-api-list";
import { downloadFromApi } from "@/core/lib/http/download";
import type { PaginationDTO } from "@/core/types";
import { DrillHoleDialog, type DrillHoleDialogTarget } from "@/modules/eksplorasi/components/drill-hole-dialog";
import { DeleteDrillHoleDialog } from "@/modules/eksplorasi/components/delete-drill-hole-dialog";
import { DrillHoleImportDialog } from "@/modules/eksplorasi/components/import/drill-hole-import-dialog";
import { DrillHoleRow } from "@/modules/eksplorasi/components/drill-hole-row";
import { DRILL_HOLE_STATUSES } from "@/modules/eksplorasi/lib/drill-hole";
import type { DrillHoleDTO, DrillHoleStatus } from "@/modules/eksplorasi/types";
import { IoAddOutline, IoCloudUploadOutline, IoReloadOutline } from "react-icons/io5";

const ALL = "ALL";

/**
 * The drill holes: search by hole ID or area, filter by status, add, edit,
 * remove, and import or export the lot. Deliberately plain -- the detailed
 * drilling features come later.
 */
export function DrillHolesTable() {
  const t = useTranslations("drilling");
  const tCommon = useTranslations("common");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DrillHoleStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("25");
  const [target, setTarget] = useState<DrillHoleDialogTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrillHoleDTO | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filters = { search, status: status === ALL ? undefined : status };
  const list = useApiList<DrillHoleDTO, { drillHoles: DrillHoleDTO[]; pagination: PaginationDTO }>(
    "/api/drill-holes",
    { ...filters, page, pageSize },
    (result) => result.drillHoles,
    { errorMessage: tCommon("loadError") }
  );

  /** Any change of filter starts again from the first page. */
  function filter(update: () => void) {
    update();
    setPage(1);
  }

  /** The holes the list is showing, filters and all, as a file the importer reads back. */
  async function exportAs(format: "xlsx" | "csv") {
    setExportError(null);
    const params = new URLSearchParams({ format, ...(filters.search ? { search } : {}) });
    if (filters.status) params.set("status", filters.status);
    setExportError(await downloadFromApi(`/api/drill-holes/export?${params.toString()}`, `drill-holes.${format}`));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            placeholder={t("searchPlaceholder")}
            onChange={(value) => filter(() => setSearch(value))}
          />
          <Select
            value={status}
            items={{ [ALL]: t("allStatuses"), ...Object.fromEntries(DRILL_HOLE_STATUSES.map((s) => [s, t(`status.${s}`)])) }}
            onValueChange={(value) => filter(() => setStatus(value as DrillHoleStatus | typeof ALL))}
          >
            <SelectTrigger aria-label={t("fields.status")} className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
              {DRILL_HOLE_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`status.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <IoCloudUploadOutline className="size-4" />
            {t("import.button")}
          </Button>
          <ExportMenu onExport={(format) => void exportAs(format)} />
          <Button className="gap-2" onClick={() => setTarget("new")}>
            <IoAddOutline className="size-4" />
            {t("add")}
          </Button>
        </div>
      </div>

      <InlineNotice tone="error">{list.error ?? exportError}</InlineNotice>

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
            {list.loading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  <IoReloadOutline className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {search || status !== ALL ? t("emptyFiltered") : t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((row, index) => (
                <DrillHoleRow key={row.id} row={row} index={index} onEdit={setTarget} onDelete={setDeleteTarget} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {list.pagination ? (
        <TablePagination
          pagination={list.pagination}
          shown={list.items.length}
          noun={t("noun")}
          pageSize={pageSize}
          onPageSizeChange={(value) => filter(() => setPageSize(value))}
          onPageChange={setPage}
        />
      ) : null}

      <DrillHoleDialog
        target={target}
        onClose={() => setTarget(null)}
        onSaved={(saved, isNew) => {
          list.setItems((rows) => (isNew ? [saved, ...rows] : rows.map((row) => (row.id === saved.id ? saved : row))));
          if (isNew) list.setPagination((current) => (current ? { ...current, total: current.total + 1 } : current));
        }}
      />

      <DrillHoleImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setPage(1);
          list.reload();
        }}
      />

      <DeleteDrillHoleDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          list.setItems((rows) => rows.filter((row) => row.id !== id));
          list.setPagination((current) => (current ? { ...current, total: Math.max(0, current.total - 1) } : current));
        }}
      />
    </div>
  );
}
