"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useResultsColumns } from "@/modules/lab/components/assay/use-results-columns";
import { useGridSelection, type GridRange } from "@/modules/lab/components/assay/grid/use-grid-selection";
import { useVirtualRows } from "@/modules/lab/components/assay/grid/use-virtual-rows";
import { ALL_COLUMNS, type Column } from "@/modules/lab/components/assay/results-entry-utils";
import {
  SHEET_MAX_ROWS,
  SHEET_START_ROWS,
  rowOfLine,
  sheetToImportText,
  type SheetRow,
} from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { rangeToTsv, spreadPaste } from "@/modules/lab/lib/records/sheet-paste";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult } from "@/core/types";
import type { ImportPreviewDTO, ImportPreviewRow } from "@/modules/lab/types";

/** Long enough that a paste is one check rather than one per keystroke. */
const CHECK_DELAY_MS = 500;
export const SHEET_ROW_HEIGHT = 36;
const KNOWN = ["sampleIdent", ...ALL_COLUMNS];

const blankRows = (count: number): SheetRow[] => Array.from({ length: count }, () => ({}));

/**
 * The paste sheet's state: rows of a Sample ID and results, checked by the
 * server as they are typed or pasted, and saved in one go.
 *
 * Checking and saving go through the sheet import (POST /api/lab-records/import)
 * -- the same matching, validation, sub-sample creation and overwrite question
 * as uploading a file, up to five thousand rows in one transaction. The grid is
 * only a better way to put the block in, and a better place to read the answer:
 * each verdict comes back by line and lands on its row and cell.
 */
export function usePasteSheet(onApplied: (count: number) => void) {
  const tPaste = useTranslations("assay.paste");
  const tCommon = useTranslations("common");
  const columnsState = useResultsColumns("atara.columns.paste-sheet.v1");
  const { columns, instrumentColumns, showRemarks, visible, setVisible } = columnsState;

  const keys = useMemo(
    () => [
      "sampleIdent",
      ...columns.map((field) => field.key),
      ...instrumentColumns.map((field) => field.key),
      ...(showRemarks ? ["remarks"] : []),
    ],
    [columns, instrumentColumns, showRemarks]
  );

  const [rows, setRows] = useState<SheetRow[]>(() => blankRows(SHEET_START_ROWS));
  const [preview, setPreview] = useState<{ text: string; dto: ImportPreviewDTO } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Each of these belongs to the sheet as it was when it was set, and lapses
  // by itself the moment the sheet changes: derived, never reset by hand.
  const [failure, setFailure] = useState<{ text: string | null; message: string } | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const requestId = useRef(0);

  const text = useMemo(() => sheetToImportText(rows, keys), [rows, keys]);
  const error = failure && failure.text === text ? failure.message : null;
  const isChecking = text !== null && preview?.text !== text && error === null;
  const confirmOverwrite = confirmFor !== null && confirmFor === text;
  const setConfirmOverwrite = (ask: boolean) => setConfirmFor(ask ? text : null);

  const send = useCallback(
    async (csv: string, apply: boolean, overwrite: boolean) =>
      (await (
        await fetch(withBasePath("/api/lab-records/import"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv, apply, overwrite, reason: tPaste("auditReason") }),
        })
      ).json()) as ApiResult<ImportPreviewDTO>,
    [tPaste]
  );

  // Checked a moment after the last change; an answer to an older sheet is dropped.
  useEffect(() => {
    if (text === null) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const body = await send(text, false, false);
        if (id !== requestId.current) return;
        if (body.success) setPreview({ text, dto: body.data });
        else setFailure({ text, message: body.error });
      } catch {
        if (id === requestId.current) setFailure({ text, message: tCommon("networkError") });
      }
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, send, tCommon]);

  const verdicts = useMemo(() => {
    const byRow = new Map<number, ImportPreviewRow>();
    if (preview && preview.text === text) for (const row of preview.dto.rows) byRow.set(rowOfLine(row.line), row);
    return byRow;
  }, [preview, text]);

  const summary = preview && preview.text === text ? preview.dto.summary : null;
  const writes = summary ? summary.update + summary.create : 0;
  const canSave = summary !== null && writes > 0 && summary.invalid === 0 && !isChecking && !isSaving;

  async function save(overwrite = false) {
    if (!canSave || text === null) return;
    if (!overwrite && (summary?.overwrite ?? 0) > 0) {
      setConfirmFor(text);
      return;
    }
    setIsSaving(true);
    setFailure(null);
    try {
      const body = await send(text, true, overwrite);
      if (!body.success) {
        if (body.code === "overwrite") setConfirmFor(text);
        else setFailure({ text, message: body.error });
        return;
      }
      onApplied(writes);
    } catch {
      setFailure({ text, message: tCommon("networkError") });
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

  const virtual = useVirtualRows({ rowCount: rows.length, rowHeight: SHEET_ROW_HEIGHT, headerHeight: 40 });

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
      const result = spreadPaste(block, { visible: keys, known: KNOWN, start: { row: range.top, col: range.left }, range });
      setTooMany(result.rowsNeeded > SHEET_MAX_ROWS);
      const reveal = result.hiddenFilled.filter((key): key is Column => (ALL_COLUMNS as string[]).includes(key));
      if (reveal.length > 0) setVisible([...visible, ...reveal.filter((key) => !visible.includes(key))]);
      // A few blank rows under the block, so the next paste has somewhere to go.
      write(result.writes, result.rowsNeeded + 5);
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
    verdicts,
    summary,
    writes,
    canSave,
    isChecking,
    isSaving,
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
