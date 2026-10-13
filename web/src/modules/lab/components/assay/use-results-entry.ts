"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "@/core/components/ui/toast";
import {
  cellId,
  isRowDirty,
  rowProblems,
  toRowValues,
  type CellField,
  type RowValues,
} from "@/modules/lab/components/assay/results-grid";
import { parseDayInput } from "@/core/lib/wita-time";
import { findOverwrites, type Overwrite } from "@/modules/lab/lib/records/overwrite";
import type { ApiResult } from "@/core/types";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import { restoreReplaced, toPayload, type Replaced } from "@/modules/lab/components/assay/results-entry-utils";
import { useResultsColumns } from "@/modules/lab/components/assay/use-results-columns";
import { useResultsClipboard } from "@/modules/lab/components/assay/use-results-clipboard";

/** The entry screen's state: the rows as typed, what changed, and the save. */
export function useResultsEntry(records: LabRecordListItemDTO[], onDone: (changed: boolean) => void) {
  const t = useTranslations("assay");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  const initial = useMemo(
    () => Object.fromEntries(records.map((record) => [record.id, toRowValues(record)])),
    [records]
  );
  const [original, setOriginal] = useState<Record<string, RowValues>>(initial);
  const [values, setValues] = useState<Record<string, RowValues>>(() => structuredClone(initial));
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** Set while the analyst decides about results a save would replace. */
  const [replacing, setReplacing] = useState<Replaced[] | null>(null);

  const { visible, setVisible, columns, instrumentColumns, showRemarks, toggleColumn } = useResultsColumns();
  // Copy, cut, paste and selecting across the boxes, as in Excel.
  const clipboard = useResultsClipboard({
    records,
    values,
    setValues,
    columns,
    instrumentColumns,
    showRemarks,
    visible,
    setVisible,
  });

  const dirtyIds = useMemo(
    () =>
      records
        .map((record) => record.id)
        .filter((id) => original[id] && values[id] && isRowDirty(original[id], values[id])),
    [records, original, values]
  );
  const invalid = useMemo(
    () =>
      records.flatMap((record, rowIndex) =>
        values[record.id] ? rowProblems(values[record.id]).map((problem) => ({ ...problem, rowIndex })) : []
      ),
    [records, values]
  );
  const isDirty = dirtyIds.length > 0;

  // Leaving the page -- reload, closing the tab, a link elsewhere -- asks too.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const setCell = useCallback(
    (id: string, field: CellField, value: string) => {
      setValues((previous) => ({ ...previous, [id]: { ...previous[id], [field]: value } }));
    },
    [setValues]
  );

  function discard() {
    setValues(structuredClone(original));
    setError(null);
  }

  const labelOf = (id: string) => {
    const record = records.find((entry) => entry.id === id);
    return record?.sampleIdent ?? record?.labCode ?? id;
  };

  /**
   * Saves the edited rows. A result that already had a value is replaced only
   * after the analyst has seen what it was and said so (`overwrite`).
   */
  async function save(overwrite = false): Promise<boolean> {
    if (!isDirty || isSaving) return false;
    if (invalid.length > 0) {
      // Straight to the first box that is wrong, rather than a message that
      // leaves somebody hunting for it.
      const first = invalid[0];
      document.getElementById(cellId(first.rowIndex, first.field))?.focus();
      setError(t("invalidCells", { count: invalid.length }));
      return false;
    }

    const payload = dirtyIds.map((id) => toPayload(id, values[id]));
    if (!overwrite) {
      const replaced = dirtyIds.flatMap((id) => {
        const fields = findOverwrites(toPayload(id, original[id]), toPayload(id, values[id]));
        return fields.length > 0 ? [{ id, label: labelOf(id), fields }] : [];
      });
      if (replaced.length > 0) {
        setReplacing(replaced);
        return false;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(withBasePath("/api/lab-records/bulk"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: payload, overwrite }),
      });
      const body: ApiResult<{ updated: number }> = await response.json();
      if (!body.success) {
        // Filled in by someone else since this screen was opened: ask, with
        // what the server found.
        if (body.code === "overwrite") {
          const details = body.details as { overwrites?: { id: string; fields: Overwrite[] }[] };
          setReplacing(
            (details.overwrites ?? []).map((entry) => ({ id: entry.id, label: labelOf(entry.id), fields: entry.fields }))
          );
          return false;
        }
        setError(body.error);
        return false;
      }
      setReplacing(null);

      setOriginal((previous) => {
        const next = { ...previous };
        for (const id of dirtyIds) next[id] = { ...values[id] };
        return next;
      });
      setSavedIds((previous) => new Set([...previous, ...dirtyIds]));
      toast(t("saved", { count: body.data.updated }));
      return true;
    } catch {
      setError(tCommon("networkError"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  // Ctrl+S (Cmd+S) saves instead of offering to download the page.
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

  function back() {
    if (isDirty) setConfirmLeave(true);
    else onDone(savedIds.size > 0);
  }

  /** Leaving with the edits still on screen, which are dropped. */
  function leave() {
    setConfirmLeave(false);
    onDone(savedIds.size > 0);
  }

  async function saveAndLeave() {
    const saved = await save();
    setConfirmLeave(false);
    if (saved) onDone(true);
  }

  /** Back to what was there: only the replaced boxes are reset. */
  function keepOld() {
    setValues((previous) => restoreReplaced(previous, replacing ?? [], original));
    setReplacing(null);
  }

  const formatDate = useCallback(
    (shiftDate: string) => {
      const date = parseDayInput(shiftDate);
      return date ? format.dateTime(date, { day: "numeric", month: "short", timeZone: "UTC" }) : shiftDate;
    },
    [format]
  );

  return {
    original,
    values,
    savedIds,
    error,
    isSaving,
    confirmLeave,
    setConfirmLeave,
    replacing,
    setReplacing,
    visible,
    columns,
    instrumentColumns,
    showRemarks,
    dirtyIds,
    invalid,
    isDirty,
    setCell,
    discard,
    save,
    back,
    leave,
    saveAndLeave,
    keepOld,
    clipboard,
    toggleColumn,
    formatDate,
  };
}
