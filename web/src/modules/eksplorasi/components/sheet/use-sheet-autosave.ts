"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { isFilled, type Cells, type SheetRow } from "@/modules/eksplorasi/components/sheet/sheet-rows";
import { readDraft, writeDraft } from "@/modules/eksplorasi/components/sheet/sheet-draft";
import { sendSheet, type useSheetCheck } from "@/modules/eksplorasi/components/sheet/use-sheet-check";
import { useAutosavePreference } from "@/modules/eksplorasi/components/sheet/sheet-preferences";
import type { DataSourceView, SheetVerdict } from "@/modules/eksplorasi/types";

/** How long the sheet has to sit still before its valid rows are saved on their own. */
export const AUTOSAVE_DELAY = 3000;

export type AutosaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: Date }
  | { status: "failed" };

/** Stands in for a row that is not to be sent: inactive, so it is skipped, and the lines after it keep their numbers. */
const SKIPPED: SheetRow = { locked: false, cells: {} };

const writable = (verdict: SheetVerdict | undefined) => verdict?.status === "create" || verdict?.status === "update";

const sampleKey = (cells: Cells) => (cells.sampleId ?? "").trim().toLowerCase();

/**
 * The sheet once an autosave is in: a new row sent takes its id, with what was
 * sent as what is stored; a changed sample takes what was sent as its stored
 * values. Whatever was typed after the send stays, as a change still to save.
 * A row emptied since (Kosongkan) is left alone.
 */
export function settleRows(
  rows: readonly SheetRow[],
  sent: readonly SheetRow[],
  saved: ReadonlyMap<number, string>,
  updated: ReadonlySet<number>
): SheetRow[] {
  return rows.map((row, index) => {
    const line = index + 1;
    const was = sent[index];
    if (!was || was === SKIPPED) return row;
    const id = saved.get(line);
    if (id && row.id === undefined && isFilled(row.cells)) return { ...row, id, locked: false, original: was.cells };
    if (updated.has(line) && row.id !== undefined && row.id === was.id) return { ...row, original: was.cells };
    return row;
  });
}

/**
 * The same, for a sheet already left (another list's tab, another menu) when
 * the answer came: its draft is settled instead, the new rows found by their
 * sample IDs.
 */
function settleDraft(view: DataSourceView, sent: readonly SheetRow[], saved: ReadonlyMap<number, string>, updated: ReadonlySet<number>) {
  const created = new Map<string, { id: string; cells: Cells }>();
  const changed = new Map<string, Cells>();
  sent.forEach((row, index) => {
    const id = saved.get(index + 1);
    if (id) created.set(sampleKey(row.cells), { id, cells: row.cells });
    if (updated.has(index + 1) && row.id) changed.set(row.id, row.cells);
  });
  const rows = readDraft(view).map((row): SheetRow => {
    const made = row.id ? undefined : created.get(sampleKey(row.cells));
    if (made) return { id: made.id, locked: false, original: made.cells, cells: row.cells };
    const stored = row.id ? changed.get(row.id) : undefined;
    return { ...row, locked: false, original: stored ?? row.original };
  });
  writeDraft(view, rows);
}

/**
 * Saves the sheet's valid rows on their own, a moment after the last edit:
 * only those the check says would be added or changed, so a row still wrong
 * holds nothing else back. One save at a time; a failed one waits for the
 * next edit to try again. Switched off and on above the sheet (remembered in this browser).
 */
export function useSheetAutosave({
  view,
  rows,
  setRows,
  check,
  blocked,
}: {
  view: DataSourceView;
  rows: SheetRow[];
  setRows: Dispatch<SetStateAction<SheetRow[]>>;
  check: ReturnType<typeof useSheetCheck>;
  /** Still loading, or a manual save under way. */
  blocked: boolean;
}) {
  const [enabled, setEnabled] = useAutosavePreference();
  const { verdictFor } = check;
  const ready = !blocked && !check.isChecking && check.error === null;
  const [state, setState] = useState<AutosaveState>({ status: "idle" });
  const saving = state.status === "saving";
  const mounted = useRef(true);
  /** The sheet as it was when a save failed: not tried again until it changes. */
  const failedOn = useRef<SheetRow[] | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !ready || saving || failedOn.current === rows) return;
    const sent = rows.map((row) => (writable(verdictFor(row)) ? row : SKIPPED));
    if (!sent.some((row) => row !== SKIPPED)) return;
    const timer = setTimeout(async () => {
      setState({ status: "saving" });
      try {
        const body = await sendSheet(view, sent, false);
        if (!body.success || body.data.summary.invalid > 0) {
          failedOn.current = rows;
          setState({ status: "failed" });
          return;
        }
        const saved = new Map((body.data.saved ?? []).map(({ line, id }) => [line, id]));
        const updated = new Set(body.data.rows.filter((verdict) => verdict.status === "update").map((verdict) => verdict.line));
        if (mounted.current) setRows((previous) => settleRows(previous, sent, saved, updated));
        else settleDraft(view, sent, saved, updated);
        setState({ status: "saved", at: new Date() });
      } catch {
        failedOn.current = rows;
        setState({ status: "failed" });
      }
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [enabled, ready, saving, rows, verdictFor, view, setRows]);

  return { state, saving, enabled, setEnabled };
}
