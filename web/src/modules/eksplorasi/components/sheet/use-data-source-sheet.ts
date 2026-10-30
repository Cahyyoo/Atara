"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/core/components/ui/toast";
import { useGridSelection, type GridRange } from "@/core/hooks/use-grid-selection";
import { rangeToTsv, spreadBlock, type CellWrite } from "@/core/lib/sheets/clipboard-block";
import { withBasePath } from "@/core/lib/http/base-path";
import { apiFetch } from "@/core/lib/http/api-client";
import type { ApiResult, PaginationDTO } from "@/core/types";
import { fieldForHeader, viewFields, VIEWS, type DataSourceField } from "@/modules/eksplorasi/lib/data-source-columns";
import { SHEET_MAX_ROWS } from "@/modules/eksplorasi/validation";
import { readSampleTypeCell } from "@/modules/eksplorasi/lib/data-source-import";
import { readDateCell } from "@/modules/eksplorasi/lib/sheet-cell";
import {
  isBlankRemark,
  matchOreas,
  MATCH_ELEMENTS,
  oreasNames,
  type OreasStandard,
} from "@/modules/eksplorasi/lib/oreas-match";
import {
  blankRows,
  asLoaded,
  cellsOf,
  hasAssay,
  isDirtyRow,
  lockCounts,
  SHEET_BLANK_ROWS,
  SHEET_RECENT_ROWS,
  withEditing,
  type SheetRow,
} from "@/modules/eksplorasi/components/sheet/sheet-rows";
import { sendSheet, useSheetCheck } from "@/modules/eksplorasi/components/sheet/use-sheet-check";
import type { DataSourceDTO, DataSourceView } from "@/modules/eksplorasi/types";

/** The columns picked from a calendar: Date, and the Duplicate list's Control Date. */
const DATE_KEYS: ReadonlySet<string> = new Set<DataSourceField>(["date", "controlDate"]);

/**
 * A date as the Date box holds it (YYYY-MM-DD), however it was pasted:
 * "01/10/2026" from an Indonesian sheet becomes 2026-10-01. Anything that is
 * not a date is kept as it came, for the box to show and the check to flag.
 */
function dateText(value: string): string {
  const read = readDateCell(value);
  return read === null || read === "invalid" ? value : read;
}

export const SHEET_ROW_HEIGHT = 36;

/**
 * A list's sheet state: the list's latest samples on top -- locked, except
 * those with no assay results yet, whose results are still to be typed in --
 * then empty rows to type or paste new ones into. A locked sample can be unlocked and
 * changed in place; locking it again puts back what was loaded. Every active
 * row is checked by the server as it changes, and Save writes them all in one
 * go. The boxes are the list's own columns.
 *
 * Opened to edit one sample (the list's Ubah), that sample is on the sheet
 * already unlocked, and `focusRow` points at it.
 */
export function useDataSourceSheet(view: DataSourceView, onSaved: () => void, editing?: DataSourceDTO) {
  const t = useTranslations("dataSource");
  const tCommon = useTranslations("common");
  const keys = useMemo<DataSourceField[]>(() => viewFields(view), [view]);
  const fixedType = VIEWS[view].sampleType;
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<{ rows: SheetRow[]; message: string } | null>(null);
  const check = useSheetCheck(view, rows, tCommon("networkError"));
  /** The CRM List's OREAS standards: the Remarks fill's values, and the Remarks dropdown's choices. */
  const [standards, setStandards] = useState<OreasStandard[]>([]);
  const hasRemarks = keys.includes("oreasRemarks");

  // Read once, for the lists with an OREAS Remarks (not Duplicate). Without
  // it the sheet still works; Remarks is simply typed, as it always was.
  useEffect(() => {
    if (!hasRemarks) return;
    const controller = new AbortController();
    (async () => {
      try {
        const outcome = await apiFetch<OreasStandard[]>("/api/crm-list/standard", { signal: controller.signal });
        if (outcome.ok) setStandards(outcome.data);
      } catch {
        // Aborted: the sheet went away first.
      }
    })();
    return () => controller.abort();
  }, [hasRemarks]);

  // The list's latest samples, oldest of them first, so the newest sits right above the empty rows.
  useEffect(() => {
    const controller = new AbortController();
    const rowOf = (sample: DataSourceDTO): SheetRow => {
      const cells = cellsOf(sample, keys, (type) => t(`sampleType.${type}`));
      return { id: sample.id, locked: hasAssay(cells), original: cells, cells };
    };
    const opened = editing ? rowOf(editing) : null;
    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/data-sources?view=${view}&page=1&pageSize=${SHEET_RECENT_ROWS}`), {
          signal: controller.signal,
        });
        const body = (await response.json()) as ApiResult<{ rows: DataSourceDTO[]; pagination: PaginationDTO }>;
        if (!body.success) throw new Error(body.error);
        const latest = [...body.data.rows].reverse().map(rowOf);
        setRows([...withEditing(latest, opened), ...blankRows(SHEET_BLANK_ROWS)]);
      } catch {
        if (controller.signal.aborted) return;
        setLoadError(tCommon("loadError"));
        // The sample being edited is in hand already: it can still be changed.
        setRows([...withEditing([], opened), ...blankRows(SHEET_BLANK_ROWS)]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [t, tCommon, editing, view, keys]);

  const existing = rows.filter((row) => row.id !== undefined).length;
  // Where the cursor goes once the sheet is there: the sample being edited, or the first empty row.
  const editedRow = editing ? rows.findIndex((row) => row.id === editing.id) : -1;
  const focusRow = editedRow === -1 ? existing : editedRow;
  const maxRows = existing + SHEET_MAX_ROWS;
  const summary = check.progress.summary;
  const writes = summary ? summary.create + summary.update : 0;
  const canSave = summary !== null && writes > 0 && summary.invalid === 0 && !check.isChecking && !isSaving;
  const error = loadError ?? check.error ?? (saveFailure && saveFailure.rows === rows ? saveFailure.message : null);

  async function save() {
    if (!canSave) return;
    const sent = rows;
    setIsSaving(true);
    try {
      const body = await sendSheet(view, sent, false);
      if (!body.success) {
        setSaveFailure({ rows: sent, message: body.error });
        return;
      }
      if (body.data.summary.invalid > 0) {
        check.remember(sent, body.data.rows);
        return;
      }
      toast(t("sheet.saved", { created: body.data.created, updated: body.data.updated }));
      onSaved();
    } catch {
      setSaveFailure({ rows: sent, message: tCommon("networkError") });
    } finally {
      setIsSaving(false);
    }
  }

  // Reloading, closing the tab or typing another address asks first while
  // there is work on the sheet: it lives nowhere else until it is saved.
  const isDirty = rows.some(isDirtyRow);
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  // Ctrl+S (Cmd+S) saves the sheet rather than offering to download the page.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * A sample type as the sheet shows it: by its name, however it was written --
   * "STANDARD", "std" and "CRM" all read as the one the list offers, through
   * the reader the import and the server use. Text it cannot read is kept as
   * written, for the server to mark.
   */
  const typeText = useCallback(
    (value: string) => {
      const type = readSampleTypeCell(value);
      return type === null || type === "invalid" ? value : t(`sampleType.${type}`);
    },
    [t]
  );

  /**
   * Writes boxes, growing the sheet as far as asked. A locked sample's boxes
   * are never written, and neither is a QC list's type: it is the list's own.
   *
   * A row whose Ni, Co, Fe2O3, Al2O3 and Cr2O3 have just become an OREAS
   * standard's (CRM List) gets the standard's name in an empty Remarks box,
   * there for the person to see -- and to change -- before it is saved. The
   * server holds the same rule (oreas-match.ts) for an import.
   */
  const write = useCallback(
    (cells: CellWrite[], grow = 0) => {
      setRows((previous) => {
        const length = Math.min(maxRows, Math.max(previous.length, grow));
        const next = length > previous.length ? [...previous, ...blankRows(length - previous.length)] : [...previous];
        const assayed = new Set<number>();
        for (const { row, key, value } of cells) {
          if (row >= next.length || next[row].locked) continue;
          if (key === "sampleType" && fixedType) continue;
          const text = key === "sampleType" ? typeText(value) : DATE_KEYS.has(key) ? dateText(value) : value;
          next[row] = { ...next[row], cells: { ...next[row].cells, [key]: text } };
          if ((MATCH_ELEMENTS as readonly string[]).includes(key)) assayed.add(row);
        }
        if (hasRemarks && standards.length > 0) {
          for (const row of assayed) {
            const rowCells = next[row].cells;
            if (!isBlankRemark(rowCells.oreasRemarks)) continue;
            const name = matchOreas(rowCells, standards);
            if (name) next[row] = { ...next[row], cells: { ...rowCells, oreasRemarks: name } };
          }
        }
        return next;
      });
    },
    [maxRows, typeText, fixedType, hasRemarks, standards]
  );

  const setCell = useCallback((row: number, key: string, value: string) => write([{ row, key, value }]), [write]);

  /** Unlocks a sample to change it, or locks it again with what was loaded put back. */
  const toggleLock = useCallback((row: number) => {
    setRows((previous) =>
      previous.map((entry, index) =>
        index !== row || entry.id === undefined
          ? entry
          : entry.locked
            ? { ...entry, locked: false }
            : { ...entry, locked: true, cells: entry.original ?? {} }
      )
    );
  }, []);

  const clipboard = useGridSelection({
    rowCount: rows.length,
    colCount: keys.length,
    clear: (range: GridRange) => {
      const cells: CellWrite[] = [];
      for (let row = range.top; row <= range.bottom; row++) {
        for (let col = range.left; col <= range.right; col++) cells.push({ row, key: keys[col], value: "" });
      }
      write(cells);
    },
    paste: (block: string, range: GridRange) => {
      const result = spreadBlock(block, {
        columns: keys,
        start: { row: range.top, col: range.left },
        range,
        keyForHeader: fieldForHeader,
      });
      // A few empty rows under the block, so the next paste has somewhere to go.
      write(result.writes, result.rowsNeeded + 5);
    },
    copyText: (range: GridRange) => rangeToTsv(range, keys, (row, key) => rows[row]?.cells[key as DataSourceField] ?? ""),
  });

  /** Empties the new rows and puts every sample back as loaded, locked unless it has no assay yet: the sheet as it opened. */
  function clearAll() {
    setRows((previous) => [
      ...previous.flatMap((row) => (row.id ? [asLoaded(row)] : [])),
      ...blankRows(SHEET_BLANK_ROWS),
    ]);
  }

  return {
    keys,
    rows,
    /** The OREAS Remarks dropdown's choices (Data Source, Standard, Blank). */
    oreasNames: useMemo(() => oreasNames(standards), [standards]),
    loading,
    existing,
    ...lockCounts(rows),
    focusRow,
    verdictFor: check.verdictFor,
    progress: check.progress,
    summary,
    writes,
    canSave,
    isChecking: check.isChecking,
    isSaving,
    error,
    isDirty,
    canAddRows: rows.length < maxRows,
    setCell,
    toggleLock,
    save,
    clearAll,
    addRows: () => write([], rows.length + 50),
    clipboard,
  };
}
