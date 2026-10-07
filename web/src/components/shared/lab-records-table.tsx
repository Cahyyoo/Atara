"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { prefetchMasterOptions } from "@/hooks/use-master-options";
import { ColumnHead } from "@/components/shared/column-head";
import { StatusBadge } from "@/components/samples/status-badge";
import { TablePagination } from "@/components/shared/table-toolbar";
import { ExportDialog } from "@/components/shared/export-dialog";
import {
  LabRecordFilters,
  type IdentFilterValue,
  type LabRecordFilterValues,
  type ResultsFilter,
} from "@/components/shared/lab-record-filters";
import { useTableParams } from "@/hooks/use-table-params";
import { usePersistedColumns } from "@/hooks/use-persisted-columns";
import { EMPTY_LAYOUT, useTableLayout } from "@/hooks/use-table-layout";
import { clampWidth, moveBefore, normalizeOrder, nudge } from "@/lib/column-layout";
import {
  ASSAY_FIELDS,
  ASSAY_TABLE_FIELDS,
  INSTRUMENT_FIELDS,
  type AssayField,
  type InstrumentField,
} from "@/lib/assay";
import { formatWitaDateTime, parseShiftDateInput } from "@/lib/shift-date";
import { downloadFromApi } from "@/lib/download";
import type { ApiResult, LabRecordDTO, LabRecordListItemDTO, PaginationDTO } from "@/types";
import { stageLabel } from "@/lib/stages";
import { cn } from "@/lib/utils";
import { subSamplePath } from "@/lib/sample-ident";
import {
  IoArrowUndoOutline,
  IoChevronForward,
  IoClipboardOutline,
  IoClose,
  IoCloudUploadOutline,
  IoCreateOutline,
  IoPencilOutline,
  IoRefreshOutline,
  IoOptionsOutline,
  IoReloadOutline,
  IoTimeOutline,
  IoTrashOutline,
} from "react-icons/io5";
import { InlineNotice } from "@/components/ui/inline-notice";

/**
 * Loaded when first needed: the edit form with its identity pickers, and the
 * detail panel. Looking things up is what this page is for, and looking things
 * up needs neither until a row is opened.
 */
const LabRecordDialog = dynamic(
  () => import("@/components/database/lab-record-dialog").then((m) => m.LabRecordDialog),
  { ssr: false }
);
const LabRecordSheet = dynamic(
  () => import("@/components/database/lab-record-sheet").then((m) => m.LabRecordSheet),
  { ssr: false }
);
/** A row's result history, read when it is first asked for. */
const RecordHistoryDialog = dynamic(
  () => import("@/components/shared/record-history-dialog").then((m) => m.RecordHistoryDialog),
  { ssr: false }
);

const BulkIdentityDialog = dynamic(
  () => import("@/components/database/bulk-identity-dialog").then((m) => m.BulkIdentityDialog),
  { ssr: false }
);

type Column = AssayField | InstrumentField;
const ALL_COLUMNS: Column[] = [
  ...ASSAY_FIELDS.map((field) => field.key),
  ...INSTRUMENT_FIELDS.map((field) => field.key),
];

/** The columns that can be moved and resized; Sample stays first, pinned. */
type Movable = "shiftDate" | "status" | Column;
const DEFAULT_ORDER: Movable[] = ["shiftDate", "status", ...ALL_COLUMNS];

/** Starting widths in pixels, until somebody drags a column wider or narrower. */
const DEFAULT_WIDTHS: Record<string, number> = {
  sample: 220,
  shiftDate: 128,
  status: 148,
  ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, 88])),
  measurementMethod: 176,
  solutionId: 132,
  measurementFinished: 176,
};
const TICK_WIDTH = 40;
const CHEVRON_WIDTH = 36;

export const DEFAULT_PAGE_SIZE = "25";

function formatAssay(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

/** The instrument's own columns: two plain strings and one instant. */
function formatInstrument(
  record: LabRecordListItemDTO,
  field: (typeof INSTRUMENT_FIELDS)[number]
): string {
  const value = record[field.key];
  if (value == null || value === "") return "—";
  // On the lab's clock, like everywhere else this timestamp is shown — the
  // browser's own zone would read eight hours out and say nothing.
  return field.kind === "datetime" ? (formatWitaDateTime(value) ?? "—") : String(value);
}

/** Clicks on these inside a row belong to them, not to the row. */
function isInteractive(target: EventTarget): boolean {
  // Element, not HTMLElement: a click on an icon lands on its <svg> or
  // <path>, which are SVG elements -- and an icon button whose icon did not
  // count as the button ticked the row it sits in.
  return target instanceof Element && target.closest("input, button, a, label") !== null;
}

/**
 * What the viewer's role allows on this table, decided by the page from
 * permissions.ts rather than inferred here from a role name.
 */
export interface LabRecordsAccess {
  /** Edit a record, and tick rows to remove or restore them. */
  canEdit: boolean;
  canExport: boolean;
  /** The Active / Deleted switch. Read-only unless canEdit is also held. */
  canViewDeleted: boolean;
}

interface LabRecordsTableProps {
  access: LabRecordsAccess;
  /**
   * The same rows serve two jobs. "database" looks records up: a row opens its
   * detail panel, and ticked rows can be deleted. "assay" picks the samples to
   * enter results for: it opens on what still has no result, a click on a row
   * ticks it, and the ticked rows are handed to the caller.
   */
  mode?: "database" | "assay";
  /** Assay mode: paste results from Excel into the ticked rows. */
  onPaste?: (records: LabRecordListItemDTO[]) => void;
  /** Assay mode: type results for the ticked rows. */
  onEnterResults?: (records: LabRecordListItemDTO[]) => void;
  /** Assay mode: import a whole sheet, matched against every sample. */
  onImport?: () => void;
}

/**
 * The Sample Database: looking lab records up.
 *
 * One column names each row -- the barcode code, with the lab code and Sample
 * ID beneath it -- where three code columns used to compete for the job, and
 * it stays pinned while the result columns scroll past it. Everything else
 * about a row is one click away in the panel, so the table carries only what
 * is compared down a column: the day, the state, and the chosen elements.
 */
export function LabRecordsTable({
  access,
  mode = "database",
  onPaste,
  onEnterResults,
  onImport,
}: LabRecordsTableProps) {
  const isAssay = mode === "assay";
  const t = useTranslations("database");
  const tSamples = useTranslations("samples");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const format = useFormatter();
  const loadError = tCommon("loadError");
  const { get, setParams, toggleSort } = useTableParams();

  const filters: LabRecordFilterValues = {
    search: get("search", ""),
    placeId: get("placeId", "ALL"),
    from: get("from", ""),
    to: get("to", ""),
    // The entry page opens on what it is for: samples still waiting for a result.
    results: get("results", isAssay ? "missing" : "all") as ResultsFilter,
    // Barcodes are made first and identified later, so "which still have no
    // Sample ID" is the Database role's to-do list.
    ident: isAssay ? "all" : (get("ident", "all") as IdentFilterValue),
  };
  const sort = get("sort", "shiftDate");
  const order = get("order", "desc");
  const page = get("page", "1");
  const pageSize = get("pageSize", DEFAULT_PAGE_SIZE);
  // Deleted rows are the database's business; results are never entered into them.
  const showDeleted = !isAssay && get("deleted", "") === "true";

  const [result, setResult] = useState<{
    key: string;
    records: LabRecordListItemDTO[];
    pagination: PaginationDTO | null;
    counts?: { missing: number; present: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleFields, setVisibleFields] = usePersistedColumns<Column>(
    "atara.columns.database",
    ASSAY_TABLE_FIELDS,
    ALL_COLUMNS
  );
  /** The whole row is kept, so ticks survive paging to rows no longer on screen. */
  const [selected, setSelected] = useState<Map<string, LabRecordListItemDTO>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LabRecordListItemDTO | null>(null);
  // Mounted on first use, then left in place so the closing animation still runs.
  const [sheetMounted, setSheetMounted] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  /** Removing samples and removing sub-samples are different acts, confirmed apart. */
  const [confirming, setConfirming] = useState<false | "samples" | "subs">(false);
  /** Export: each sample's sub-samples as rows of their own, right after it. */
  const [exportSubs, setExportSubs] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  /** Bumped after a delete, to re-read rows this table did not itself change. */
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Ticking rows is for two things: picking samples to enter results for, and
   * removing or restoring them. Somebody who may do neither -- an administrator
   * reading the database -- gets no tick boxes at all.
   */
  const canSelect = isAssay || access.canEdit;

  /**
   * How the columns are arranged: the order somebody dragged them into and the
   * widths they set, remembered per page in this browser. Shift date and
   * status are always shown; the element and instrument columns as chosen.
   */
  const [layout, setLayout] = useTableLayout("atara.table-layout." + mode);
  const columnOrder = useMemo(() => normalizeOrder(layout.order, DEFAULT_ORDER) as Movable[], [layout.order]);
  const shownColumns = columnOrder.filter(
    (key) => key === "shiftDate" || key === "status" || visibleFields.includes(key)
  );
  /** A width being dragged: shown live, saved once the edge is let go. */
  const [draftWidth, setDraftWidth] = useState<{ key: string; width: number } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMounted, setBulkMounted] = useState(false);
  /**
   * The records the identity dialog was opened for, taken at that moment: it
   * can be minimized while the table is filtered and ticked again, and must
   * keep editing the records it started with.
   */
  const [bulkRecords, setBulkRecords] = useState<LabRecordListItemDTO[]>([]);
  const [bulkMinimized, setBulkMinimized] = useState(false);

  const widthOf = (key: string) =>
    draftWidth?.key === key ? draftWidth.width : (layout.widths[key] ?? DEFAULT_WIDTHS[key] ?? 120);
  const tableWidth =
    (canSelect ? TICK_WIDTH : 0) +
    widthOf("sample") +
    shownColumns.reduce((total, key) => total + widthOf(key), 0) +
    (isAssay ? 0 : CHEVRON_WIDTH);

  function resizeColumn(key: string, width: number, final: boolean) {
    if (!final) {
      setDraftWidth({ key, width });
      return;
    }
    setDraftWidth(null);
    setLayout({ ...layout, widths: { ...layout.widths, [key]: clampWidth(width) } });
  }

  function resetColumnWidth(key: string) {
    const widths = { ...layout.widths };
    delete widths[key];
    setLayout({ ...layout, widths });
  }

  function moveColumn(key: string, target: string) {
    setLayout({ ...layout, order: moveBefore(columnOrder, key, target) });
  }

  function nudgeColumn(key: string, step: -1 | 1) {
    setLayout({ ...layout, order: nudge(columnOrder, shownColumns, key, step) });
  }

  // Sample, the movable columns, the chevron, and the tick box when there is one.
  const columnCount = 1 + shownColumns.length + (canSelect ? 1 : 0) + (isAssay ? 0 : 1);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.placeId !== "ALL") params.set("placeId", filters.placeId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.results !== "all") params.set("results", filters.results);
    if (filters.ident && filters.ident !== "all") params.set("ident", filters.ident);
    if (showDeleted) params.set("deleted", "true");
    params.set("sort", sort);
    params.set("order", order);
    return params;
  }, [filters.search, filters.placeId, filters.from, filters.to, filters.results, filters.ident, showDeleted, sort, order]);

  /**
   * The counts on the Results filter change only when the filters do, so they
   * are asked for once per filter change and kept across paging and sorting.
   * Each one is a pass over every matching row; on every page turn that was
   * the most expensive part of the request, for a number that had not moved.
   */
  const filterKey = buildParams().toString();
  const [countedFor, setCountedFor] = useState<string | null>(null);
  const wantsCounts = countedFor !== filterKey;

  const queryKey = (() => {
    const params = buildParams();
    params.set("page", page);
    params.set("pageSize", pageSize);
    if (wantsCounts) params.set("counts", "true");
    return params.toString();
  })();

  // The token is part of the key but not of the URL: a reload after a delete
  // asks the same question again and must not be answered from the result in hand.
  const resultKey = `${reloadToken}:${queryKey}`;
  const isLoading = result?.key !== resultKey;
  const showRefreshing = usePendingDisplay(isLoading);
  const records = useMemo(() => result?.records ?? [], [result]);
  /**
   * Which samples have their sub-samples unfolded beneath them. Folded unless
   * opened with the arrow -- or unless a search matched one of the subs, which
   * would otherwise find the sample without showing why. What was set by hand
   * wins over what the search opened.
   */
  const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const searchOpens = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    if (!needle) return new Set<string>();
    return new Set(
      records
        .filter((record) =>
          record.subs?.some((sub) =>
            [sub.labCode, sub.sampleIdent].some((code) => code?.toLowerCase().includes(needle))
          )
        )
        .map((record) => record.id)
    );
  }, [records, filters.search]);
  function isOpen(record: LabRecordListItemDTO): boolean {
    return folds.get(record.id) ?? searchOpens.has(record.id);
  }
  function toggleSubs(record: LabRecordListItemDTO) {
    const open = !isOpen(record);
    setFolds((previous) => new Map(previous).set(record.id, open));
  }
  /** The row whose result history is open, if any. */
  const [historyOf, setHistoryOf] = useState<LabRecordListItemDTO | null>(null);
  const [historyMounted, setHistoryMounted] = useState(false);
  function openHistory(record: LabRecordListItemDTO) {
    setHistoryMounted(true);
    setHistoryOf(record);
  }
  /** A small icon beside a row's codes: who changed its results, when, to what. */
  const historyButton = (record: LabRecordListItemDTO, code: string) => (
    <button
      type="button"
      aria-label={t("history.rowLabel", { code })}
      title={t("history.rowLabel", { code })}
      onClick={() => openHistory(record)}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <IoTimeOutline aria-hidden className="pointer-events-none size-3.5" />
    </button>
  );

  /** Whether any sample on the page has subs, so the codes keep one indent. */
  const anySubs = records.some((record) => (record.subs?.length ?? 0) > 0);
  /**
   * The rows as drawn: each sample, then its sub-samples beneath it. Ticking,
   * shift-ranges and "select shown" all follow this order.
   */
  const rows = useMemo(
    () =>
      records.flatMap((record) => [
        record,
        ...((folds.get(record.id) ?? searchOpens.has(record.id)) ? (record.subs ?? []) : []),
      ]),
    [records, folds, searchOpens]
  );
  const pagination = result?.pagination ?? null;

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/lab-records?${queryKey}`, { signal: controller.signal });
        const body: ApiResult<{
          records: LabRecordListItemDTO[];
          pagination: PaginationDTO;
          counts?: { missing: number; present: number };
        }> = await response.json();

        if (!body.success) {
          setError(body.error);
          setResult({ key: resultKey, records: [], pagination: null });
          return;
        }
        setError(null);
        setResult((previous) => ({
          key: resultKey,
          records: body.data.records,
          pagination: body.data.pagination,
          // Absent when this page did not ask; the last answer still stands.
          counts: body.data.counts ?? previous?.counts,
        }));
        if (body.data.counts) setCountedFor(filterKey);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError(loadError);
        setResult({ key: resultKey, records: [], pagination: null });
      }
    })();

    return () => controller.abort();
  }, [resultKey, queryKey, loadError]);

  const formatDate = useCallback(
    (shiftDate: string) => {
      const date = parseShiftDateInput(shiftDate);
      // Shift dates are midnight UTC of the day; formatting in UTC keeps the day.
      return date ? format.dateTime(date, { dateStyle: "medium", timeZone: "UTC" }) : shiftDate;
    },
    [format]
  );

  async function handleExport(kind: "xlsx" | "csv", columns: string[]) {
    setError(null);
    const params = buildParams();
    params.set("format", kind);
    params.set("columns", columns.join(","));
    if (exportSubs) params.set("subs", "include");

    const message = await downloadFromApi(
      `/api/lab-records/export?${params.toString()}`,
      `sample-database.${kind}`
    );
    if (message) setError(message);
  }

  function handleSaved(updated: LabRecordDTO) {
    setResult((previous) =>
      previous
        ? {
            ...previous,
            records: previous.records.map((record) =>
              record.id === updated.id
                ? { ...record, ...updated }
                : record.subs?.some((sub) => sub.id === updated.id)
                  ? {
                      ...record,
                      subs: record.subs.map((sub) => (sub.id === updated.id ? { ...sub, ...updated } : sub)),
                    }
                  : record
            ),
          }
        : previous
    );
  }

  function toggleField(field: Column) {
    setVisibleFields(
      visibleFields.includes(field)
        ? visibleFields.filter((key) => key !== field)
        : [...visibleFields, field]
    );
  }

  /** Where the last tick was, for shift+click to tick everything up to here. */
  const anchor = useRef<number | null>(null);
  /** Whether shift was held for the tick box click that is about to land. */
  const shiftHeld = useRef(false);

  function toggleRow(record: LabRecordListItemDTO, index: number, withShift = false) {
    setSelected((previous) => {
      const next = new Map(previous);
      const select = !previous.has(record.id);
      // Shift carries this row's new state across the range from the last one
      // ticked, the way a file list does -- a shift's samples are usually a
      // run of consecutive rows.
      const from = withShift && anchor.current !== null ? Math.min(anchor.current, index) : index;
      const to = withShift && anchor.current !== null ? Math.max(anchor.current, index) : index;
      for (const row of rows.slice(from, to + 1)) {
        if (select) next.set(row.id, row);
        else next.delete(row.id);
      }
      return next;
    });
    anchor.current = index;
  }

  const allShownSelected = rows.length > 0 && rows.every((record) => selected.has(record.id));

  // Only the rows on screen: a filter can match thousands, and "select all"
  // silently reaching past what is visible is how the wrong rows get changed.
  function toggleShown() {
    setSelected((previous) => {
      const next = new Map(previous);
      rows.forEach((record) =>
        allShownSelected ? next.delete(record.id) : next.set(record.id, record)
      );
      return next;
    });
  }

  const selectedRecords = useMemo(() => [...selected.values()], [selected]);
  /** A sub-sample has no barcode of its own: what applies to a sample does not apply to it. */
  const selectedSamples = useMemo(() => selectedRecords.filter((record) => !record.parentId), [selectedRecords]);
  const selectedSubs = useMemo(() => selectedRecords.filter((record) => record.parentId), [selectedRecords]);

  /** The most a bulk change takes at once, and the most one page can hold. */
  const MATCH_LIMIT = 200;
  const [isSelectingMatching, setIsSelectingMatching] = useState(false);
  const total = result?.pagination?.total ?? 0;
  const allMatchingSelected = total > 0 && selected.size >= Math.min(total, MATCH_LIMIT) && allShownSelected;

  /**
   * Every record the filters match, not only this page's rows -- a batch of
   * fifty new barcodes spans two pages. Up to the bulk limit, read with the
   * very filters on screen, so nothing outside them is ever picked.
   */
  async function selectAllMatching(): Promise<LabRecordListItemDTO[] | null> {
    setIsSelectingMatching(true);
    setError(null);
    try {
      const params = buildParams();
      params.set("page", "1");
      params.set("pageSize", String(MATCH_LIMIT));
      const response = await fetch(`/api/lab-records?${params.toString()}`);
      const body: ApiResult<{ records: LabRecordListItemDTO[] }> = await response.json();
      if (!body.success) {
        setError(body.error);
        return null;
      }
      setSelected(new Map(body.data.records.map((record) => [record.id, record])));
      return body.data.records;
    } catch {
      setError(loadError);
      return null;
    } finally {
      setIsSelectingMatching(false);
    }
  }

  /**
   * The selection in table order -- the order sample numbers are given in --
   * rather than the order the boxes were clicked. Rows not on this page keep
   * the order they were picked in, after those that are.
   */
  const selectionInTableOrder = useMemo(() => {
    const position = new Map(rows.map((record, index) => [record.id, index]));
    return [...selected.values()]
      .map((record, picked) => ({ record, picked, at: position.get(record.id) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.at - b.at || a.picked - b.picked)
      .map((entry) => entry.record);
  }, [selected, rows]);

  // The identity dialog is one click away once rows are ticked, or the CTA
  // shows: fetch its code and the vocabularies now, so it opens at once and
  // with its codes in place rather than after a round trip.
  const bulkLikely =
    !isAssay &&
    access.canEdit &&
    !showDeleted &&
    (selected.size > 0 || (filters.ident === "missing" && total > 0));
  const bulkWarmed = useRef(false);
  useEffect(() => {
    if (!bulkLikely || bulkWarmed.current) return;
    bulkWarmed.current = true;
    void import("@/components/database/bulk-identity-dialog");
    void prefetchMasterOptions();
  }, [bulkLikely]);

  /** The same records as a minimized dialog bring it back as it was; others start afresh. */
  function openBulkIdentity(picked: LabRecordListItemDTO[]) {
    setBulkRecords(picked);
    setBulkMounted(true);
    setBulkOpen(true);
    setBulkMinimized(false);
  }

  async function handleRemove() {
    setIsRemoving(true);
    setError(null);

    try {
      const response = await fetch("/api/samples/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The flag lives on the sample, not on its lab record. Sub-samples
          // carry their parent's sample, and are removed on their own.
          ids: selectedSamples.map((record) => record.sample.id),
          restore: showDeleted,
        }),
      });
      const body: ApiResult<{ changed: number }> = await response.json();

      if (!body.success) {
        setError(body.error);
        return;
      }
      // The rows have left this view, so the selection that pointed at them is
      // meaningless; re-reading is the only honest next state.
      setSelected(new Map());
      setReloadToken((token) => token + 1);
    } catch {
      setError(loadError);
    } finally {
      setIsRemoving(false);
      setConfirming(false);
    }
  }

  /** Sub-samples are deleted outright; their parent keeps a note of it. */
  async function handleRemoveSubs() {
    setIsRemoving(true);
    setError(null);
    try {
      const response = await fetch("/api/lab-records/subs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedSubs.map((record) => record.id) }),
      });
      const body: ApiResult<{ removed: number }> = await response.json();
      if (!body.success) {
        setError(body.error);
        return;
      }
      setSelected(new Map());
      setReloadToken((token) => token + 1);
    } catch {
      setError(loadError);
    } finally {
      setIsRemoving(false);
      setConfirming(false);
    }
  }

  function openRow(record: LabRecordListItemDTO) {
    setSheetMounted(true);
    setOpenId(record.id);
  }

  function handleRowClick(
    event: MouseEvent<HTMLTableRowElement>,
    record: LabRecordListItemDTO,
    index: number
  ) {
    if (isInteractive(event.target)) return;
    // Picking is what the entry list is for, so the whole row is the tick box.
    if (isAssay) toggleRow(record, index, event.shiftKey);
    else openRow(record);
  }

  function handleRowKey(
    event: KeyboardEvent<HTMLTableRowElement>,
    record: LabRecordListItemDTO,
    index: number
  ) {
    if ((event.key !== "Enter" && !(isAssay && event.key === " ")) || isInteractive(event.target)) return;
    event.preventDefault();
    if (isAssay) toggleRow(record, index, event.shiftKey);
    else openRow(record);
  }

  const openRecord = rows.find((record) => record.id === openId) ?? null;
  const isFiltered =
    filters.search !== "" || filters.placeId !== "ALL" || filters.from !== "" || filters.to !== "" ||
    filters.results !== (isAssay ? "missing" : "all") ||
    (filters.ident ?? "all") !== "all";

  /** What each movable column is called, how it sorts, and how it lines up. */
  function headFor(key: Movable): { label: string; sortField?: string; align: "left" | "right" } {
    if (key === "shiftDate") return { label: t("shiftDate"), sortField: "shiftDate", align: "left" };
    if (key === "status") return { label: tCommon("status"), align: "left" };
    const assay = ASSAY_FIELDS.find((field) => field.key === key);
    if (assay) {
      // The unit on the header rather than on every value.
      return { label: assay.key === "sum" ? assay.shortLabel : `${assay.shortLabel} %`, sortField: assay.key, align: "right" };
    }
    return { label: t(key), sortField: key, align: "left" };
  }

  function cellFor(key: Movable, record: LabRecordListItemDTO) {
    if (key === "shiftDate") {
      return (
        <TableCell key={key} className="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">
          {formatDate(record.shiftDate)}
        </TableCell>
      );
    }
    if (key === "status") {
      return (
        <TableCell key={key} className="overflow-hidden">
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <StatusBadge status={record.sample.status} />
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {record.sample.currentStage
                ? stageLabel(tStages, record.sample.currentStage.key, record.sample.currentStage.name)
                : tSamples("notStarted")}
            </span>
          </div>
        </TableCell>
      );
    }
    const assay = ASSAY_FIELDS.find((field) => field.key === key);
    if (assay) {
      const value = record[assay.key];
      return (
        <TableCell
          key={key}
          className={cn("overflow-hidden text-right tabular-nums", value === null && "text-muted-foreground/60")}
        >
          {formatAssay(value)}
        </TableCell>
      );
    }
    const instrument = INSTRUMENT_FIELDS.find((field) => field.key === key)!;
    const text = formatInstrument(record, instrument);
    return (
      <TableCell key={key} className="overflow-hidden text-ellipsis text-muted-foreground" title={text}>
        {text}
      </TableCell>
    );
  }

  /** The props every resizable, reorderable heading shares. */
  const headProps = {
    sort,
    order,
    onSort: (field: string) => toggleSort(field, sort, order),
    onResize: resizeColumn,
    onResetWidth: resetColumnWidth,
    onDragStartColumn: (key: string) => setDragKey(key),
    onDragOverColumn: (key: string) => setDropKey(dragKey && dragKey !== key ? key : null),
    onDropColumn: (key: string) => {
      if (dragKey && dragKey !== key) moveColumn(dragKey, key);
      setDragKey(null);
      setDropKey(null);
    },
    onDragEndColumn: () => {
      setDragKey(null);
      setDropKey(null);
    },
    onNudge: nudgeColumn,
  };

  const columnPicker = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button data-tour="records-columns" variant="outline" className="gap-2">
            <IoOptionsOutline className="size-4" />
            {tCommon("columns")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto">
        <DropdownMenuGroup>
          {/* Every column at once; ticked again, back to the usual few. */}
          <DropdownMenuCheckboxItem
            checked={ALL_COLUMNS.every((key) => visibleFields.includes(key))}
            onCheckedChange={() =>
              setVisibleFields(
                ALL_COLUMNS.every((key) => visibleFields.includes(key)) ? [...ASSAY_TABLE_FIELDS] : [...ALL_COLUMNS]
              )
            }
            closeOnClick={false}
          >
            {t("layout.selectAll")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{tCommon("columns")}</DropdownMenuLabel>
          {ASSAY_FIELDS.map((field) => (
            <DropdownMenuCheckboxItem
              key={field.key}
              checked={visibleFields.includes(field.key)}
              onCheckedChange={() => toggleField(field.key)}
              closeOnClick={false}
            >
              {field.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuLabel>{t("instrumentColumns")}</DropdownMenuLabel>
          {INSTRUMENT_FIELDS.map((field) => (
            <DropdownMenuCheckboxItem
              key={field.key}
              checked={visibleFields.includes(field.key)}
              onCheckedChange={() => toggleField(field.key)}
              closeOnClick={false}
            >
              {t(field.key)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLayout(EMPTY_LAYOUT)}>
            <IoRefreshOutline className="size-4" />
            {t("layout.reset")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // The first two columns stay put while the results scroll sideways -- from a
  // tablet up. On a phone they would cover most of the width they scroll in.
  const pinTick = "left-0 z-10 w-10 bg-background sm:sticky";
  // A pinned cell needs a solid background, so a ticked row's tint is laid over
  // it as an image -- otherwise the two pinned cells stay white beside a
  // tinted rest of the row.
  const pinTint =
    "group-data-[selected=true]:bg-linear-to-r group-data-[selected=true]:from-primary/5 group-data-[selected=true]:to-primary/5";
  const pinSample = cn("z-10 bg-background sm:sticky", canSelect ? "left-10" : "left-0");

  return (
    <div className="flex flex-col gap-4">
      {/* Every control on one row: search, the three filters, then what acts
          on the table. It used to take three rows before the first sample. */}
      <LabRecordFilters
        values={filters}
        // A new filter means a different set of rows: what was ticked under the
        // old one is not carried over, unseen, into the new one.
        onChange={(updates) => {
          setSelected(new Map());
          setFolds(new Map());
          setParams(updates);
        }}
        showResults
        // On the entry list the choice is the point, so it stays in view as
        // buttons with their counts; in the database it is one filter of four.
        resultsVariant={isAssay ? "segmented" : "select"}
        resultsDefault={isAssay ? "missing" : "all"}
        counts={result?.counts ?? null}
        showIdent={!isAssay}
        trailing={
          <>
            {columnPicker}
            {/* No ticking needed: a sheet with a Sample ID column finds its
                own samples, and fills or creates their sub-samples. */}
            {isAssay && onPaste ? (
              <Button data-tour="assay-paste" variant="outline" className="gap-2" onClick={() => onPaste([])}>
                <IoClipboardOutline className="size-4" />
                {t("paste.openAll")}
              </Button>
            ) : null}
            {/* Who changed which result, and when, across every sample. */}
            <Link href="/assay/history" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
              <IoTimeOutline className="size-4" />
              {t("history.open")}
            </Link>
            {isAssay && onImport ? (
              <Button data-tour="assay-import" variant="outline" className="gap-2" onClick={onImport}>
                <IoCloudUploadOutline className="size-4" />
                {t("importFile")}
              </Button>
            ) : null}
            {!isAssay && access.canExport ? (
              <ExportDialog
                kind="labRecords"
                tourId="records-export"
                onExport={handleExport}
                option={{ label: t("subs.exportOption"), checked: exportSubs, onChange: setExportSubs }}
              />
            ) : null}
          </>
        }
      />

      <InlineNotice tone="error">{error}</InlineNotice>

      {/* Only once something is ticked: an empty bar would just take up room
          above the table on every visit. */}
      {/* New barcodes waiting for their identity: say how many, and offer
          to do them all in one go instead of ticking box by box. */}
      {!isAssay && access.canEdit && !showDeleted && filters.ident === "missing" && total > 0 && selected.size === 0 ? (
        <div
          data-tour="records-ident-cta"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <p className="text-sm">
            <span className="font-medium">{t("identCta.title", { count: total })}</span>{" "}
            <span className="text-muted-foreground">{t("identCta.hint")}</span>
          </p>
          <Button
            className="ml-auto gap-2"
            disabled={isSelectingMatching}
            onClick={async () => {
              const picked = await selectAllMatching();
              if (picked && picked.length > 0) openBulkIdentity(picked);
            }}
          >
            {isSelectingMatching ? (
              <IoReloadOutline className="size-4 animate-spin" />
            ) : (
              <IoCreateOutline className="size-4" />
            )}
            {total > MATCH_LIMIT
              ? t("identCta.actionFirst", { count: MATCH_LIMIT })
              : t("identCta.action", { count: total })}
          </Button>
        </div>
      ) : null}

      {/* Only once something is ticked: an empty bar would just take up room
          above the table on every visit. The identity change leads; removal
          sits apart on the right, so the two are not mistaken for each other. */}
      {!isAssay && canSelect && selectedRecords.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {t("selectedCount", { count: selectedRecords.length })}
            </span>
            {/* Samples only: a sub-sample's identity is its parent's. */}
            {!showDeleted && access.canEdit && selectedSamples.length > 0 ? (
              <Button
                size="sm"
                className="gap-2"
                onClick={() => openBulkIdentity(selectionInTableOrder.filter((record) => !record.parentId))}
              >
                <IoCreateOutline className="size-4" />
                {t("bulkIdentity.open", { count: selectedSamples.length })}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelected(new Map())}>
              <IoClose className="size-4" />
              {t("clearSelection")}
            </Button>
            <Button
              size="sm"
              variant={showDeleted ? "default" : "destructive"}
              className="ml-auto gap-2"
              disabled={isRemoving || selectedSamples.length === 0}
              onClick={() => setConfirming("samples")}
            >
              {showDeleted ? <IoArrowUndoOutline className="size-4" /> : <IoTrashOutline className="size-4" />}
              {showDeleted ? t("restore") : t("remove")}
            </Button>
            {!showDeleted && selectedSubs.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-destructive"
                disabled={isRemoving}
                onClick={() => setConfirming("subs")}
              >
                <IoTrashOutline className="size-4" />
                {t("subs.remove", { count: selectedSubs.length })}
              </Button>
            ) : null}
          </div>
          {/* The whole page is ticked and the filters match more than it
              shows: offer the rest, the way a mail client does. */}
          {allShownSelected && total > records.length ? (
            <p className="text-xs text-muted-foreground">
              {allMatchingSelected ? (
                <>
                  {total > MATCH_LIMIT
                    ? t("selection.firstMatchingSelected", { count: selected.size, total })
                    : t("selection.allMatchingSelected", { count: selected.size })}{" "}
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setSelected(new Map())}
                  >
                    {t("selection.clear")}
                  </button>
                </>
              ) : (
                <>
                  {t("selection.allOnPage", { count: records.length })}{" "}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60"
                    disabled={isSelectingMatching}
                    onClick={() => void selectAllMatching()}
                  >
                    {isSelectingMatching ? <IoReloadOutline aria-hidden className="size-3 animate-spin" /> : null}
                    {total > MATCH_LIMIT
                      ? t("selection.selectFirstMatching", { count: MATCH_LIMIT, total })
                      : t("selection.selectAllMatching", { count: total })}
                  </button>
                </>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <TableRefreshing isRefreshing={showRefreshing}>
        <div className="rounded-lg border bg-background">
          {/* The table's own caption: how many rows the filters found, and --
              for an admin -- which set of rows this is. A view, not an action:
              deleted rows are either what the table shows or absent from it. */}
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5">
            <span className="text-sm text-muted-foreground">
              {pagination ? t("caption", { count: pagination.total }) : tCommon("loading")}
            </span>
            {access.canViewDeleted && !isAssay ? (
              <div data-tour="records-view" role="tablist" aria-label={t("viewLabel")} className="flex gap-0.5 rounded-lg bg-muted p-0.5">
                {[
                  { deleted: false, label: t("activeView") },
                  { deleted: true, label: t("deletedView") },
                ].map((view) => (
                  <button
                    key={String(view.deleted)}
                    type="button"
                    role="tab"
                    aria-selected={showDeleted === view.deleted}
                    onClick={() => {
                      if (showDeleted === view.deleted) return;
                      setSelected(new Map());
                      setParams({ deleted: view.deleted ? "true" : null });
                    }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors",
                      showDeleted === view.deleted
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {/* Fixed layout with a width per column: the widths somebody dragged
              are the widths shown, however long the values in them are. */}
          <Table className="table-fixed" style={{ width: tableWidth, minWidth: "100%" }}>
            <colgroup>
              {canSelect ? <col style={{ width: TICK_WIDTH }} /> : null}
              <col style={{ width: widthOf("sample") }} />
              {shownColumns.map((key) => (
                <col key={key} data-col={key} style={{ width: widthOf(key) }} />
              ))}
              {isAssay ? null : <col style={{ width: CHEVRON_WIDTH }} />}
            </colgroup>
            <TableHeader>
              <TableRow>
                {canSelect ? (
                  <TableHead className={pinTick}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label={t("selectShown")}
                      checked={allShownSelected}
                      disabled={records.length === 0}
                      onChange={toggleShown}
                    />
                  </TableHead>
                ) : null}
                <ColumnHead
                  {...headProps}
                  columnKey="sample"
                  label={t("sampleColumn")}
                  sortField="labCode"
                  width={widthOf("sample")}
                  className={pinSample}
                  resizeLabel={t("layout.resize", { column: t("sampleColumn") })}
                  moveHint=""
                />
                {shownColumns.map((key) => {
                  const head = headFor(key);
                  return (
                    <ColumnHead
                      key={key}
                      {...headProps}
                      columnKey={key}
                      label={head.label}
                      sortField={head.sortField}
                      align={head.align}
                      width={widthOf(key)}
                      movable
                      dragging={dragKey === key}
                      dropTarget={dropKey === key}
                      resizeLabel={t("layout.resize", { column: head.label })}
                      moveHint={t("layout.move")}
                    />
                  );
                })}
                {isAssay ? null : (
                  <TableHead>
                    <span className="sr-only">{t("sheet.open")}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Placeholder rows only when there is genuinely nothing yet: a
                  refresh keeps the rows it has, because replacing readable data
                  with a placeholder is a downgrade, not a loading state. */}
              {isLoading && records.length === 0 ? (
                <TableSkeleton rows={10} columns={columnCount} />
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <span>{isFiltered ? t("emptyFiltered") : t("empty")}</span>
                      {isFiltered ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setParams({ search: null, placeId: null, from: null, to: null, results: null, ident: null })
                          }
                        >
                          {t("filters.reset")}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((record, rowIndex) => {
                  const isSelected = selected.has(record.id);
                  const isSub = Boolean(record.parentId);
                  return (
                    <AnimatedTableRow
                      key={record.id}
                      data-tour={rowIndex === 0 ? "records-row" : undefined}
                      index={rowIndex}
                      tabIndex={0}
                      aria-label={
                        isAssay ? undefined : t("sheet.openFor", { code: isSub ? record.labCode : record.sample.sampleCode })
                      }
                      data-selected={isSelected || undefined}
                      onClick={(event) => handleRowClick(event, record, rowIndex)}
                      onKeyDown={(event) => handleRowKey(event, record, rowIndex)}
                      className={cn(
                        "group cursor-pointer select-none focus-visible:bg-muted/60 focus-visible:outline-none",
                        isAssay && isSelected && "bg-primary/5"
                      )}
                    >
                      {canSelect ? (
                        <TableCell className={cn(pinTick, isAssay && pinTint, "group-hover:bg-muted")}>
                          <input
                            type="checkbox"
                            className="size-4 accent-primary"
                            aria-label={isSub ? record.labCode : record.sample.sampleCode}
                            data-tour={rowIndex === 0 ? "records-row-select" : undefined}
                            checked={isSelected}
                            onChange={() => toggleRow(record, rowIndex, shiftHeld.current)}
                            // The change event does not say whether shift was held.
                            onMouseDown={(event) => {
                              shiftHeld.current = event.shiftKey;
                            }}
                          />
                        </TableCell>
                      ) : null}
                      {/* Wraps rather than cutting off when the column is
                          narrowed: the codes have no spaces, so they may break
                          anywhere -- a code on two lines still reads, one
                          ending in "..." does not. */}
                      <TableCell
                        className={cn(
                          pinSample,
                          isAssay && pinTint,
                          "whitespace-normal align-top group-hover:bg-muted"
                        )}
                      >
                        {isSub ? (
                          // A sub-sample beneath the sample it was taken from:
                          // the same container, its own results.
                          <div className="flex min-w-0 animate-in flex-col items-start pl-7 duration-150 fade-in-0">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              <span aria-hidden className="text-muted-foreground">↳</span>
                              {/* Its own page, like a sample's: a link, so the
                                  row's own click steps aside. */}
                              <Link
                                href={subSamplePath(record.sample.sampleCode, record.subCode ?? "")}
                                className="text-primary hover:underline"
                              >
                                {t("subs.label", { code: record.subCode ?? "" })}
                              </Link>
                              {historyButton(record, record.labCode)}
                            </span>
                            <span className="max-w-full font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                              {record.labCode}
                              {record.sampleIdent ? ` · ${record.sampleIdent}` : ""}
                            </span>
                          </div>
                        ) : (
                        <div className="flex min-w-0 items-start gap-1">
                          {/* Its sub-samples fold away behind an arrow: right
                              while folded, down while open. A button, so the
                              row's own click (tick, or open the record) stays
                              out of the way on its own. */}
                          {(record.subs?.length ?? 0) > 0 ? (
                            <button
                              type="button"
                              aria-expanded={isOpen(record)}
                              aria-label={t("subs.toggle", { count: record.subs!.length })}
                              title={t("subs.toggle", { count: record.subs!.length })}
                              onClick={() => toggleSubs(record)}
                              className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <IoChevronForward
                                aria-hidden
                                className={cn(
                                  "pointer-events-none size-3.5 transition-transform duration-150",
                                  isOpen(record) && "rotate-90"
                                )}
                              />
                            </button>
                          ) : anySubs ? (
                            <span aria-hidden className="size-5 shrink-0" />
                          ) : null}
                        <div className="flex min-w-0 flex-col items-start">
                          {/*
                            A real link, at last.

                            This was a span in the primary colour: it looked
                            like a link on both lists and was one on neither.
                            Clicking it ticked the row here and opened the
                            record panel on the database — never the sample it
                            names, which is the one thing its colour promised.

                            Nothing else had to change for it. isInteractive
                            above already counts an anchor, so the row's own
                            click handler steps aside on its own: no
                            stopPropagation, and no exception for somebody to
                            remember later.
                          */}
                          <span className="flex flex-wrap items-center gap-x-1.5">
                            <Link
                              href={`/samples/${encodeURIComponent(record.sample.sampleCode)}`}
                              className="font-medium text-primary [overflow-wrap:anywhere] hover:underline"
                            >
                              {record.sample.sampleCode}
                            </Link>
                            {(record.subs?.length ?? 0) > 0 ? (
                              <span className="rounded-full bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground">
                                {t("subs.count", { count: record.subs!.length })}
                              </span>
                            ) : null}
                            {historyButton(record, record.sample.sampleCode)}
                          </span>
                          <span className="max-w-full font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                            {record.labCode}
                            {record.sampleIdent ? ` · ${record.sampleIdent}` : ""}
                          </span>
                        </div>
                        </div>
                        )}
                      </TableCell>
                      {/* In the order the headings were arranged. A row with no
                          results yet shows a dash per column rather than one
                          merged cell: with the columns movable, the result
                          columns need not sit side by side. */}
                      {shownColumns.map((key) => cellFor(key, record))}
                      {isAssay ? null : (
                        <TableCell className="text-muted-foreground">
                          <IoChevronForward aria-hidden className="size-4" />
                        </TableCell>
                      )}
                    </AnimatedTableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </TableRefreshing>

      {/*
        The entry list's actions, pinned to the bottom while anything is ticked
        so they are beside the rows being picked. Paste leads: most results
        arrive as a sheet from the instrument.
      */}
      {isAssay && selectedRecords.length > 0 ? (
        <div data-tour="assay-actions" className="sticky bottom-3 z-20 order-last flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 px-4 py-3 shadow-raised backdrop-blur-sm">
          <span className="text-sm font-medium">{t("selectedCount", { count: selectedRecords.length })}</span>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelected(new Map())}>
            <IoClose className="size-4" />
            {t("clearSelection")}
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            {onEnterResults ? (
              <Button variant="outline" className="gap-2" onClick={() => onEnterResults(selectedRecords)}>
                <IoPencilOutline className="size-4" />
                {t("enterManually")}
              </Button>
            ) : null}
            {selectedSubs.length > 0 ? (
              <Button
                variant="outline"
                className="gap-2 text-destructive"
                disabled={isRemoving}
                onClick={() => setConfirming("subs")}
              >
                <IoTrashOutline className="size-4" />
                {t("subs.remove", { count: selectedSubs.length })}
              </Button>
            ) : null}
            {onPaste ? (
              <Button className="gap-2" onClick={() => onPaste(selectedRecords)}>
                <IoClipboardOutline className="size-4" />
                {t("paste.open")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {pagination ? (
        <TablePagination
          pagination={pagination}
          shown={records.length}
          noun={t("noun")}
          pageSize={pageSize}
          onPageSizeChange={(value) => setParams({ pageSize: value === DEFAULT_PAGE_SIZE ? null : value })}
          onPageChange={(next) => setParams({ page: next === 1 ? null : String(next) })}
        />
      ) : null}

      <Dialog open={confirming !== false} onOpenChange={(open) => (isRemoving || open ? null : setConfirming(false))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirming === "subs"
                ? t("subs.removeConfirmTitle", { count: selectedSubs.length })
                : showDeleted
                  ? t("restoreConfirmTitle", { count: selectedSamples.length })
                  : t("removeConfirmTitle", { count: selectedSamples.length })}
            </DialogTitle>
            <DialogDescription>
              {confirming === "subs"
                ? t("subs.removeConfirmBody")
                : showDeleted
                  ? t("restoreConfirmBody")
                  : t("removeConfirmBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isRemoving} onClick={() => setConfirming(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant={showDeleted && confirming !== "subs" ? "default" : "destructive"}
              className="gap-2"
              disabled={isRemoving}
              onClick={confirming === "subs" ? handleRemoveSubs : handleRemove}
            >
              {isRemoving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {confirming === "subs" ? t("subs.removeShort") : showDeleted ? t("restore") : t("remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {historyMounted ? <RecordHistoryDialog record={historyOf} onClose={() => setHistoryOf(null)} /> : null}

      {sheetMounted ? (
        <LabRecordSheet
          record={openRecord}
          canEdit={access.canEdit}
          formatDate={formatDate}
          onClose={() => setOpenId(null)}
          onEdit={(record) => {
            setDialogMounted(true);
            setEditing(record);
          }}
        />
      ) : null}

      {dialogMounted ? (
        <LabRecordDialog record={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      ) : null}

      {bulkMounted ? (
        <BulkIdentityDialog
          open={bulkOpen}
          records={bulkRecords}
          minimized={bulkMinimized}
          onMinimizedChange={setBulkMinimized}
          onClose={() => {
            setBulkOpen(false);
            setBulkMinimized(false);
          }}
          onSaved={() => {
            // The Sample IDs changed on the server; re-read rather than guess.
            setSelected(new Map());
            setReloadToken((token) => token + 1);
          }}
        />
      ) : null}
    </div>
  );
}
