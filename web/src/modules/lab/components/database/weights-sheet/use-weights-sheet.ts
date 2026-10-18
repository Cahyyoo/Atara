"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useGridSelection, type GridRange } from "@/core/hooks/use-grid-selection";
import { useVirtualRows } from "@/core/hooks/use-virtual-rows";
import { SHEET_START_ROWS, type SheetRow } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { SHEET_ROW_HEIGHT } from "@/modules/lab/components/assay/paste-sheet/use-paste-sheet";
import {
  WEIGHTS_KEYS,
  isFilledRow,
  requestRow,
  sendWeights,
  useWeightsCheck,
} from "@/modules/lab/components/database/weights-sheet/use-weights-check";
import { rangeToTsv } from "@/core/lib/sheets/clipboard-block";
import { spreadPaste } from "@/modules/lab/lib/records/sheet-paste";
import { weightsHeader } from "@/modules/lab/lib/records/weights-paste";
import { toast } from "@/core/components/ui/toast";

/** The weighings route's own ceiling (updateWeightsSchema): one request checks or saves the whole sheet. */
export const WEIGHTS_MAX_ROWS = 500;

const blankRows = (count: number): SheetRow[] => Array.from({ length: count }, () => ({}));

/**
 * The Wp/W0/Wd sheet: a Sample ID and its three weighings per row, pasted
 * from Excel or typed, checked by the weighings route as they land
 * (useWeightsCheck), and saved in one go. The same grid, selection and
 * clipboard as the results paste sheet.
 */
export function useWeightsSheet({ open, onSaved }: { open: boolean; onSaved: () => void }) {
  const t = useTranslations("database.weights");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState<SheetRow[]>(() => blankRows(SHEET_START_ROWS));
  const [saveFailure, setSaveFailure] = useState<{ rows: SheetRow[]; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [tooMany, setTooMany] = useState(false);
  const check = useWeightsCheck(rows);

  const summary = check.progress.summary;
  const writes = summary?.update ?? 0;
  const canSave = summary !== null && writes > 0 && summary.invalid === 0 && !check.isChecking && !isSaving;
  const error = check.error ?? (saveFailure && saveFailure.rows === rows ? saveFailure.message : null);

  function reset() {
    setRows(blankRows(SHEET_START_ROWS));
    check.forget();
    setTooMany(false);
    setSaveFailure(null);
  }

  async function save() {
    if (!canSave) return;
    const filled = rows.flatMap((row, index) => (isFilledRow(row) ? [requestRow(row, index + 1)] : []));
    setIsSaving(true);
    try {
      const body = await sendWeights(false, filled);
      if (!body.success) {
        setSaveFailure({ rows, message: body.error });
        return;
      }
      toast(t("saved", { count: body.data.saved }));
      reset();
      onSaved();
    } catch {
      setSaveFailure({ rows, message: tCommon("networkError") });
    } finally {
      setIsSaving(false);
    }
  }

  // Ctrl+S (Cmd+S) saves the sheet rather than offering to download the page --
  // while it is open: closed, it stays mounted behind the table.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Closing the tab mid-save is asked about.
  useEffect(() => {
    if (!isSaving) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isSaving]);

  const setCell = useCallback((row: number, key: string, value: string) => {
    setRows((previous) => previous.map((entry, index) => (index === row ? { ...entry, [key]: value } : entry)));
  }, []);

  const write = useCallback((cells: { row: number; key: string; value: string }[], grow = 0) => {
    setRows((previous) => {
      const length = Math.min(WEIGHTS_MAX_ROWS, Math.max(previous.length, grow));
      const next = length > previous.length ? [...previous, ...blankRows(length - previous.length)] : [...previous];
      for (const { row, key, value } of cells) {
        if (row < next.length) next[row] = { ...next[row], [key]: value };
      }
      return next;
    });
  }, []);

  const virtual = useVirtualRows({ rowCount: rows.length, rowHeight: SHEET_ROW_HEIGHT, headerHeight: 48, overscan: 4 });

  const clipboard = useGridSelection({
    rowCount: rows.length,
    colCount: WEIGHTS_KEYS.length,
    reveal: virtual.scrollToRow,
    // Every box here is typed as well as pasted, so Delete empties all of them.
    clear: (range: GridRange) => {
      const cells = [];
      for (let row = range.top; row <= range.bottom; row++) {
        for (let col = range.left; col <= range.right; col++) cells.push({ row, key: WEIGHTS_KEYS[col], value: "" });
      }
      write(cells);
    },
    paste: (block: string, range: GridRange) => {
      const result = spreadPaste(block, {
        visible: WEIGHTS_KEYS,
        known: WEIGHTS_KEYS,
        start: { row: range.top, col: range.left },
        range,
        rawDates: true,
        readHeader: weightsHeader,
      });
      setTooMany(result.rowsNeeded > WEIGHTS_MAX_ROWS);
      // A few blank rows under the block, so the next paste has somewhere to go.
      write(result.writes, result.rowsNeeded + 5);
    },
    copyText: (range: GridRange) => rangeToTsv(range, WEIGHTS_KEYS, (row, key) => rows[row]?.[key] ?? ""),
  });

  function clearAll() {
    reset();
    virtual.scrollToRow(0);
  }

  return {
    rows,
    verdictFor: check.verdictFor,
    progress: check.progress,
    summary,
    writes,
    canSave,
    isChecking: check.isChecking,
    isSaving,
    error,
    tooMany,
    setCell,
    save,
    reset,
    clearAll,
    addRows: () => write([], rows.length + 50),
    virtual,
    clipboard,
  };
}
