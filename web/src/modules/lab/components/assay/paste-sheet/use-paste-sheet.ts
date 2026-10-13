"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useResultsColumns } from "@/modules/lab/components/assay/use-results-columns";
import { useGridSelection, type GridRange } from "@/modules/lab/components/assay/grid/use-grid-selection";
import { useVirtualRows } from "@/modules/lab/components/assay/grid/use-virtual-rows";
import { useSheetCheck } from "@/modules/lab/components/assay/paste-sheet/use-sheet-check";
import { lineOf } from "@/modules/lab/components/assay/paste-sheet/sheet-check";
import { ALL_COLUMNS, type Column } from "@/modules/lab/components/assay/results-entry-utils";
import {
  SHEET_COLUMN_ORDER,
  SHEET_MAX_ROWS,
  SHEET_START_ROWS,
  sheetToImportText,
  type SheetRow,
} from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { INSTRUMENT_EXPORT_ORDER } from "@/modules/lab/lib/records/assay";
import { readClipboardBlock, rangeToTsv, spreadPaste } from "@/modules/lab/lib/records/sheet-paste";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult } from "@/core/types";
import type { ImportPreviewDTO } from "@/modules/lab/types";

export const SHEET_ROW_HEIGHT = 36;
const KNOWN = ["sampleIdent", ...ALL_COLUMNS];
/** Shown before the boxes fill, past this many rows: long enough to be noticed. */
const BIG_PASTE = 200;

const blankRows = (count: number): SheetRow[] => Array.from({ length: count }, () => ({}));

/**
 * The paste sheet's state: rows of a Sample ID and results in the
 * instrument's own column order, checked by the server as they are typed or
 * pasted (only the rows that changed -- useSheetCheck), and saved in one go
 * through the sheet import: the same matching, validation, sub-sample creation
 * and overwrite question as uploading a file, in one transaction.
 *
 * Whatever takes a moment says so while it happens -- a big paste, the checks
 * batch by batch, the save -- so the sheet never just sits there.
 */
export function usePasteSheet(onApplied: (count: number) => void) {
  const tPaste = useTranslations("assay.paste");
  const tCommon = useTranslations("common");
  // Opens on exactly the instrument export's columns; the key is v2 because
  // the first version opened on the elements alone.
  const columnsState = useResultsColumns("atara.columns.paste-sheet.v2", INSTRUMENT_EXPORT_ORDER as unknown as Column[]);
  const { visible, setVisible } = columnsState;

  const keys = useMemo(
    () => SHEET_COLUMN_ORDER.filter((key) => key === "sampleIdent" || visible.includes(key as Column)) as string[],
    [visible]
  );

  const [rows, setRows] = useState<SheetRow[]>(() => blankRows(SHEET_START_ROWS));
  const [isSaving, setIsSaving] = useState(false);
  const [pasting, setPasting] = useState(0);
  const [saveFailure, setSaveFailure] = useState<{ rows: SheetRow[]; message: string } | null>(null);
  const [confirmFor, setConfirmFor] = useState<SheetRow[] | null>(null);
  const [tooMany, setTooMany] = useState(false);

  const send = useCallback(
    async (csv: string, apply: boolean, overwrite: boolean, signal?: AbortSignal) =>
      (await (
        await fetch(withBasePath("/api/lab-records/import"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv, apply, overwrite, reason: tPaste("auditReason") }),
          signal,
        })
      ).json()) as ApiResult<ImportPreviewDTO>,
    [tPaste]
  );
  const check = useSheetCheck({
    rows,
    keys,
    send: useCallback((csv: string, signal: AbortSignal) => send(csv, false, false, signal), [send]),
    networkError: tCommon("networkError"),
  });

  const summary = check.progress.summary;
  const writes = summary ? summary.update + summary.create : 0;
  const canSave = summary !== null && writes > 0 && summary.invalid === 0 && !check.isChecking && !isSaving;
  const error = check.error ?? (saveFailure && saveFailure.rows === rows ? saveFailure.message : null);
  // Asked about one sheet: an edit after the question needs the question again.
  const confirmOverwrite = confirmFor !== null && confirmFor === rows;
  const setConfirmOverwrite = (ask: boolean) => setConfirmFor(ask ? rows : null);

  async function save(overwrite = false) {
    if (!canSave) return;
    if (!overwrite && (summary?.overwrite ?? 0) > 0) {
      setConfirmFor(rows);
      return;
    }
    const text = sheetToImportText(rows, keys, (row) => lineOf(row, keys));
    if (text === null) return;
    setIsSaving(true);
    try {
      const body = await send(text, true, overwrite);
      if (!body.success) {
        if (body.code === "overwrite") setConfirmFor(rows);
        else setSaveFailure({ rows, message: body.error });
        return;
      }
      // The sheet closes and comes back fresh (results-page.tsx): no verdict outlives the save.
      onApplied(writes);
    } catch {
      setSaveFailure({ rows, message: tCommon("networkError") });
    } finally {
      setIsSaving(false);
    }
  }

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

  // Closing the tab mid-save is asked about: the write is one transaction, but
  // nobody should have to wonder whether it went through.
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
      const length = Math.min(SHEET_MAX_ROWS, Math.max(previous.length, grow));
      const next = length > previous.length ? [...previous, ...blankRows(length - previous.length)] : [...previous];
      for (const { row, key, value } of cells) {
        if (row < next.length) next[row] = { ...next[row], [key]: value };
      }
      return next;
    });
  }, []);

  // Four rows past each edge: enough that a scroll never shows a gap, few
  // enough that opening the sheet draws little more than the screen holds.
  const virtual = useVirtualRows({ rowCount: rows.length, rowHeight: SHEET_ROW_HEIGHT, headerHeight: 48, overscan: 4 });

  function pasteBlock(block: string, range: GridRange) {
    // Dates stay as the sheet wrote them ("9/1/2026 8:54"): the box is text here.
    const result = spreadPaste(block, {
      visible: keys,
      known: KNOWN,
      start: { row: range.top, col: range.left },
      range,
      rawDates: true,
    });
    setTooMany(result.rowsNeeded > SHEET_MAX_ROWS);
    const reveal = result.hiddenFilled.filter((key): key is Column => (ALL_COLUMNS as string[]).includes(key));
    if (reveal.length > 0) setVisible([...visible, ...reveal.filter((key) => !visible.includes(key))]);
    // A few blank rows under the block, so the next paste has somewhere to go.
    write(result.writes, result.rowsNeeded + 5);
  }

  const clipboard = useGridSelection({
    rowCount: rows.length,
    colCount: keys.length,
    reveal: virtual.scrollToRow,
    clear: (range: GridRange) => {
      const cells = [];
      for (let row = range.top; row <= range.bottom; row++) {
        for (let col = range.left; col <= range.right; col++) cells.push({ row, key: keys[col], value: "" });
      }
      write(cells);
    },
    paste: (block: string, range: GridRange) => {
      const size = readClipboardBlock(block).length;
      if (size < BIG_PASTE) {
        pasteBlock(block, range);
        return;
      }
      // Say so first, then do it on the next frame, once the notice is painted.
      setPasting(size);
      requestAnimationFrame(() =>
        setTimeout(() => {
          pasteBlock(block, range);
          setPasting(0);
        }, 0)
      );
    },
    copyText: (range: GridRange) => rangeToTsv(range, keys, (row, key) => rows[row]?.[key] ?? ""),
  });

  function clearAll() {
    setRows(blankRows(SHEET_START_ROWS));
    setTooMany(false);
    // Back to the top: an empty sheet scrolled to where row 640 used to be is no sheet at all.
    virtual.scrollToRow(0);
  }

  return {
    columnsState,
    keys,
    rows,
    verdictFor: check.verdictFor,
    progress: check.progress,
    summary,
    writes,
    canSave,
    isChecking: check.isChecking,
    isSaving,
    pasting,
    error,
    tooMany,
    confirmOverwrite,
    setConfirmOverwrite,
    setCell,
    save,
    clearAll,
    addRows: () => write([], rows.length + 50),
    virtual,
    clipboard,
  };
}
