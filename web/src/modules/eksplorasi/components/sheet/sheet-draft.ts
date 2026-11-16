import { useCallback, useEffect, useRef } from "react";
import { blankRows, isDirtyRow, SHEET_BLANK_ROWS, type Cells, type SheetRow } from "@/modules/eksplorasi/components/sheet/sheet-rows";
import type { DataSourceView } from "@/modules/eksplorasi/types";

/**
 * A sheet's unsaved work, kept in this browser as it is typed: moving to
 * another list's sheet, another menu, a reload or a closed tab, and it is put
 * back on the next visit. Only the rows that hold work are kept -- new rows
 * with something in them, and unlocked samples that were changed -- per list.
 * In this browser only, like the other sheet preferences: not per account.
 */

export interface DraftRow {
  id?: string;
  original?: Cells;
  cells: Cells;
}

interface Draft {
  savedAt: string;
  rows: DraftRow[];
}

const keyOf = (view: DataSourceView) => `atara.eksplorasi.sheetDraft.v1.${view}`;

/** Fired on this window whenever a draft is written or forgotten: the sheet tabs mark the lists that hold one. */
export const DRAFT_EVENT = "atara:sheet-draft";
const announce = () => window.dispatchEvent(new Event(DRAFT_EVENT));

/** The rows worth keeping: the work that would otherwise be lost. */
export function draftRows(rows: readonly SheetRow[]): DraftRow[] {
  return rows.filter(isDirtyRow).map(({ id, original, cells }) => (id ? { id, original, cells } : { cells }));
}

export function readDraft(view: DataSourceView): DraftRow[] {
  try {
    const raw = window.localStorage.getItem(keyOf(view));
    if (!raw) return [];
    const draft = JSON.parse(raw) as Draft;
    return Array.isArray(draft?.rows) ? draft.rows.filter((row) => row && typeof row.cells === "object") : [];
  } catch {
    return [];
  }
}

/** Whether the list holds a draft: cheap, for every render of the sheet tabs (an empty draft is removed, never kept). */
export function hasDraft(view: DataSourceView): boolean {
  try {
    return window.localStorage.getItem(keyOf(view)) !== null;
  } catch {
    return false;
  }
}

/** Keeps the sheet's work, or forgets the draft once there is none. */
export function writeDraft(view: DataSourceView, rows: readonly SheetRow[]): void {
  const kept = draftRows(rows);
  try {
    if (kept.length === 0) window.localStorage.removeItem(keyOf(view));
    else window.localStorage.setItem(keyOf(view), JSON.stringify({ savedAt: new Date().toISOString(), rows: kept } satisfies Draft));
  } catch {
    // Private mode or a full quota: the work simply is not kept.
  }
  announce();
}

export function clearDraft(view: DataSourceView): void {
  try {
    window.localStorage.removeItem(keyOf(view));
  } catch {
    // Nothing to forget.
  }
  announce();
}

/**
 * The sheet as loaded with a draft put back on it. A changed sample still
 * among the loaded ones takes its drafted boxes, unlocked, against what the
 * server holds now; one no longer among them comes below them, as an older
 * sample opened for editing does. The drafted new rows follow, then the empty
 * rows.
 */
export function mergeDraft(loaded: readonly SheetRow[], draft: readonly DraftRow[]): SheetRow[] {
  const drafted = new Map(draft.flatMap((row) => (row.id ? [[row.id, row] as const] : [])));
  const merged = loaded.map((row) => {
    const mine = row.id ? drafted.get(row.id) : undefined;
    if (!mine) return row;
    drafted.delete(row.id!);
    return { ...row, locked: false, cells: mine.cells };
  });
  const older = [...drafted.values()].map((row): SheetRow => ({ id: row.id, locked: false, original: row.original ?? {}, cells: row.cells }));
  const added = draft.filter((row) => !row.id).map((row): SheetRow => ({ locked: false, cells: row.cells }));
  return [...merged, ...older, ...added, ...blankRows(SHEET_BLANK_ROWS)];
}

/**
 * Keeps the sheet's work in the draft as it changes, and once more on leaving
 * (the page closed, or another sheet opened). Not before the sheet is loaded:
 * an empty sheet would wipe the draft it is about to put back. Returns the
 * call for a save: the draft forgotten, and leaving does not keep it again.
 */
export function useDraftKeeping(view: DataSourceView, rows: SheetRow[], loading: boolean): () => void {
  const latest = useRef<SheetRow[] | null>(null);
  useEffect(() => {
    if (loading) return;
    latest.current = rows;
    const timer = setTimeout(() => writeDraft(view, rows), 300);
    return () => clearTimeout(timer);
  }, [loading, rows, view]);
  useEffect(() => {
    const flush = () => {
      if (latest.current) writeDraft(view, latest.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [view]);
  return useCallback(() => {
    latest.current = null;
    clearDraft(view);
  }, [view]);
}
