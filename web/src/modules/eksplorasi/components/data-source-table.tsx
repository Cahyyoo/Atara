"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/core/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { SearchInput } from "@/core/components/form/search-input";
import { ExportMenu, TablePagination } from "@/core/components/table/table-toolbar";
import { useApiList } from "@/core/hooks/use-api-list";
import { apiFetch } from "@/core/lib/http/api-client";
import { downloadFromApi } from "@/core/lib/http/download";
import type { PaginationDTO } from "@/core/types";
import { DeleteDataSourceDialog } from "@/modules/eksplorasi/components/delete-data-source-dialog";
import { DataSourceImportDialog } from "@/modules/eksplorasi/components/import/data-source-import-dialog";
import { DataSourceRow } from "@/modules/eksplorasi/components/data-source-row";
import { columnWidths, isNumericColumn, listColumns, type ListColumn } from "@/modules/eksplorasi/components/list-columns";
import { ELEMENT_LABELS, isElementField, SAMPLE_TYPES, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";
import type { DataSourceDTO, DataSourceView, SampleType } from "@/modules/eksplorasi/types";
import { IoAddOutline, IoCloudUploadOutline, IoReloadOutline } from "react-icons/io5";
import { cn } from "@/core/lib/utils";

const ALL = "ALL";

/**
 * One of the four lists: the whole data source, or the rows of one QC type.
 * Search by sample, hole, control or campaign; filter by campaign (and, on the
 * data source, by type); add and change rows on the sheet's own page; remove
 * one; import or export the lot with this list's columns.
 *
 * Every column fits the page: the table is fixed-width, each column a share of
 * it (list-columns.ts), and a cell too long for its share is cut with an
 * ellipsis and shown whole on hover. Only a screen too narrow for that many
 * columns -- a phone -- scrolls sideways.
 */
export function DataSourceTable({ view }: { view: DataSourceView }) {
  const t = useTranslations("dataSource");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState<string>(ALL);
  const [sampleType, setSampleType] = useState<SampleType | typeof ALL>(ALL);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("25");
  const [deleteTarget, setDeleteTarget] = useState<DataSourceDTO | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const definition = VIEWS[view];
  const columns = useMemo(() => listColumns(view), [view]);
  const widths = useMemo(() => columnWidths(columns), [columns]);
  const filters = {
    view,
    search,
    campaign: campaign === ALL ? undefined : campaign,
    sampleType: definition.sampleType === null && sampleType !== ALL ? sampleType : undefined,
  };
  const list = useApiList<DataSourceDTO, { rows: DataSourceDTO[]; pagination: PaginationDTO }>(
    "/api/data-sources",
    { ...filters, page, pageSize },
    (result) => result.rows,
    { errorMessage: tCommon("loadError") }
  );

  // The campaigns to filter by: a short list, read once.
  useEffect(() => {
    let live = true;
    void apiFetch<string[]>("/api/data-sources/campaigns", { networkError: tCommon("networkError") }).then((outcome) => {
      if (live && outcome.ok) setCampaigns(outcome.data);
    });
    return () => {
      live = false;
    };
  }, [tCommon]);

  /** Any change of filter starts again from the first page. */
  function filter(update: () => void) {
    update();
    setPage(1);
  }

  /** The rows the list is showing, filters and all, as a file this list's importer reads back. */
  async function exportAs(format: "xlsx" | "csv") {
    setExportError(null);
    const params = new URLSearchParams({ format, view });
    if (filters.search) params.set("search", filters.search);
    if (filters.campaign) params.set("campaign", filters.campaign);
    if (filters.sampleType) params.set("sampleType", filters.sampleType);
    setExportError(await downloadFromApi(`/api/data-sources/export?${params.toString()}`, `${definition.fileName}.${format}`));
  }

  function label(column: ListColumn): string {
    if (column === "actions") return tCommon("actions");
    if (isElementField(column)) return ELEMENT_LABELS[column];
    return t(`fields.${column}`);
  }

  const filtered = Boolean(search) || campaign !== ALL || sampleType !== ALL;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={search} placeholder={t("searchPlaceholder")} onChange={(value) => filter(() => setSearch(value))} />
          <Select
            value={campaign}
            items={{ [ALL]: t("allCampaigns"), ...Object.fromEntries(campaigns.map((name) => [name, name])) }}
            onValueChange={(value) => filter(() => setCampaign(value as string))}
          >
            <SelectTrigger aria-label={t("fields.campaign")} className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allCampaigns")}</SelectItem>
              {campaigns.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {definition.sampleType === null ? (
            <Select
              value={sampleType}
              items={{ [ALL]: t("allTypes"), ...Object.fromEntries(SAMPLE_TYPES.map((type) => [type, t(`sampleType.${type}`)])) }}
              onValueChange={(value) => filter(() => setSampleType(value as SampleType | typeof ALL))}
            >
              <SelectTrigger aria-label={t("fields.sampleType")} className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allTypes")}</SelectItem>
                {SAMPLE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`sampleType.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <IoCloudUploadOutline className="size-4" />
            {t("import.button")}
          </Button>
          <ExportMenu onExport={(format) => void exportAs(format)} />
          <Link href={`${definition.path}/new`} className={buttonVariants({ className: "gap-2" })}>
            <IoAddOutline className="size-4" />
            {t(`views.${view}.add`)}
          </Link>
        </div>
      </div>

      <InlineNotice tone="error">{list.error ?? exportError}</InlineNotice>

      {/* Clipped for the rounded corners, not scrolled, from a laptop up. */}
      <div className="rounded-lg border bg-background max-lg:overflow-x-auto lg:overflow-clip">
        <table className="w-full table-fixed border-collapse text-[11px] max-lg:min-w-[64rem]">
          <colgroup>
            {columns.map((column, index) => (
              <col key={column} style={{ width: widths[index] }} />
            ))}
          </colgroup>
          <thead className="bg-muted/60">
            <tr className="border-b">
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    "px-1 py-2 text-[11px] font-semibold leading-tight whitespace-normal text-foreground",
                    isNumericColumn(column) || column === "actions" ? "text-right" : "text-left"
                  )}
                >
                  {label(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.loading ? (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  <IoReloadOutline className="mx-auto size-5 animate-spin" />
                </td>
              </tr>
            ) : list.items.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                  {filtered ? t("emptyFiltered") : t(`views.${view}.empty`)}
                </td>
              </tr>
            ) : (
              list.items.map((row) => (
                <DataSourceRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  onEdit={(target) => router.push(`${definition.path}/${target.id}/edit`)}
                  onDelete={setDeleteTarget}
                />
              ))
            )}
          </tbody>
        </table>
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

      <DataSourceImportDialog
        view={view}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setPage(1);
          list.reload();
        }}
      />

      <DeleteDataSourceDialog
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
