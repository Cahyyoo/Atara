"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/core/components/ui/toast";
import { useGridSelection, type GridRange } from "@/core/hooks/use-grid-selection";
import { useVirtualRows } from "@/core/hooks/use-virtual-rows";
import { rangeToTsv, spreadBlock, type CellWrite } from "@/core/lib/sheets/clipboard-block";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult, PaginationDTO } from "@/core/types";
import { DRILL_HOLE_FIELDS, fieldForHeader, type DrillHoleField } from "@/modules/eksplorasi/lib/drill-hole-columns";
import { DRILL_SHEET_MAX_ROWS } from "@/modules/eksplorasi/validation";
import { readStatusCell } from "@/modules/eksplorasi/lib/drill-hole-import";
import {
  blankRows,
  cellsOfHole,
  isActive,
  isDirtyRow,
  SHEET_BLANK_ROWS,
  SHEET_RECENT_HOLES,
  withEditing,
  type SheetRow,
} from "@/modules/eksplorasi/components/sheet/sheet-rows";
import { sendSheet, useDrillSheetCheck } from "@/modules/eksplorasi/components/sheet/use-drill-sheet-check";
import type { DrillHoleDTO } from "@/modules/eksplorasi/types";

export const SHEET_ROW_HEIGHT = 36;
const KEYS: string[] = [...DRILL_HOLE_FIELDS];

/**
 * The drilling sheet's state: the latest holes on top, locked, then empty rows
 * to type or paste new holes into. A locked hole can be unlocked and changed
 * in place; locking it again puts back what was loaded. Every active row is
 * checked by the server as it changes, and Save writes them all in one go.
 *
 * Opened to edit one hole (the list's Ubah), that hole is on the sheet already
 * unlocked, and `focusRow` points at it.
 */
export function useDrillSheet(onSaved: () => void, editing?: DrillHoleDTO) {
  const t = useTranslations("drilling");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailure, setSaveFailure] = useState<{ rows: SheetRow[]; message: string } | null>(null);
  const check = useDrillSheetCheck(rows, tCommon("networkError"));

  // The latest holes, oldest of them first, so the newest sits right above the empty rows.
  useEffect(() => {
    const controller = new AbortController();
    const rowOf = (hole: DrillHoleDTO): SheetRow => {
      const cells = cellsOfHole(hole, (status) => t(`status.${status}`));
      return { id: hole.id, locked: true, original: cells, cells };
    };
    const opened = editing ? rowOf(editing) : null;
    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/drill-holes?page=1&pageSize=${SHEET_RECENT_HOLES}`), {
          signal: controller.signal,
        });
        const body = (await response.json()) as ApiResult<{ drillHoles: DrillHoleDTO[]; pagination: PaginationDTO }>;
        if (!body.success) throw new Error(body.error);
        const holes = [...body.data.drillHoles].reverse().map(rowOf);
        setRows([...withEditing(holes, opened), ...blankRows(SHEET_BLANK_ROWS)]);
      } catch {
        if (controller.signal.aborted) return;
        setLoadError(tCommon("loadError"));
        // The hole being edited is in hand already: it can still be changed.
        setRows([...withEditing([], opened), ...blankRows(SHEET_BLANK_ROWS)]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [t, tCommon, editing]);

  const existing = rows.filter((row) => row.id !== undefined).length;
  // Where the cursor goes once the sheet is there: the hole being edited, or the first empty row.
  const editedRow = editing ? rows.findIndex((row) => row.id === editing.id) : -1;
  const focusRow = editedRow === -1 ? existing : editedRow;
  const maxRows = existing + DRILL_SHEET_MAX_ROWS;
  const summary = check.progress.summary;
  const writes = summary ? summary.create + summary.update : 0;
  const canSave = summary !== null && writes > 0 && summary.invalid === 0 && !check.isChecking && !isSaving;
  const error = loadError ?? check.error ?? (saveFailure && saveFailure.rows === rows ? saveFailure.message : null);

  async function save() {
    if (!canSave) return;
    const sent = rows;
    setIsSaving(true);
    try {
      const body = await sendSheet(sent, false);
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
   * A status as the sheet shows it: by its name, however it was written --
   * "COMPLETED", "selesai" and "Done" all read as the one the list offers,
   * through the reader the import and the server use. Text it cannot read is
   * kept as written, for the server to mark.
   */
  const statusText = useCallback(
    (value: string) => {
      const status = readStatusCell(value);
      return status === null || status === "invalid" ? value : t(`status.${status}`);
    },
    [t]
  );

  /** Writes boxes, growing the sheet as far as asked; a locked hole's boxes are never written. */
  const write = useCallback(
    (cells: CellWrite[], grow = 0) => {
      setRows((previous) => {
        const length = Math.min(maxRows, Math.max(previous.length, grow));
        const next = length > previous.length ? [...previous, ...blankRows(length - previous.length)] : [...previous];
        for (const { row, key, value } of cells) {
          if (row >= next.length || next[row].locked) continue;
          const text = key === "status" ? statusText(value) : value;
          next[row] = { ...next[row], cells: { ...next[row].cells, [key]: text } };
        }
        return next;
      });
    },
    [maxRows, statusText]
  );

  const setCell = useCallback((row: number, key: string, value: string) => write([{ row, key, value }]), [write]);

  /** Unlocks a hole to change it, or locks it again with what was loaded put back. */
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

  const virtual = useVirtualRows({ rowCount: rows.length, rowHeight: SHEET_ROW_HEIGHT, headerHeight: 48, overscan: 4 });

  const clipboard = useGridSelection({
    rowCount: rows.length,
    colCount: KEYS.length,
    reveal: virtual.scrollToRow,
    clear: (range: GridRange) => {
      const cells: CellWrite[] = [];
      for (let row = range.top; row <= range.bottom; row++) {
        for (let col = range.left; col <= range.right; col++) cells.push({ row, key: KEYS[col], value: "" });
      }
      write(cells);
    },
    paste: (block: string, range: GridRange) => {
      const result = spreadBlock(block, {
        columns: KEYS,
        start: { row: range.top, col: range.left },
        range,
        keyForHeader: fieldForHeader,
      });
      // A few empty rows under the block, so the next paste has somewhere to go.
      write(result.writes, result.rowsNeeded + 5);
    },
    copyText: (range: GridRange) => rangeToTsv(range, KEYS, (row, key) => rows[row]?.cells[key as DrillHoleField] ?? ""),
  });

  /** Empties the new rows and locks every hole again: the sheet as it opened. */
  function clearAll() {
    setRows((previous) => [
      ...previous.flatMap((row) => (row.id ? [{ ...row, locked: true, cells: row.original ?? {} }] : [])),
      ...blankRows(SHEET_BLANK_ROWS),
    ]);
  }

  return {
    keys: KEYS,
    rows,
    loading,
    existing,
    focusRow,
    verdictFor: check.verdictFor,
    progress: check.progress,
    summary,
    writes,
    canSave,
    isChecking: check.isChecking,
    isSaving,
    error,
    hasActive: rows.some(isActive),
    isDirty,
    canAddRows: rows.length < maxRows,
    setCell,
    toggleLock,
    save,
    clearAll,
    addRows: () => write([], rows.length + 50),
    virtual,
    clipboard,
  };
}
