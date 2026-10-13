"use client";

import { useMemo, useRef, useState } from "react";
import type { ApiResult } from "@/core/types";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import { MATCH_LIMIT } from "@/modules/lab/components/shared/lab-records-table/columns";

/** The ticked rows: by box, by shift-range, by page, or every match. */
export function useRecordSelection({
  rows,
  total,
  buildParams,
  setError,
  loadError,
}: {
  rows: LabRecordListItemDTO[];
  total: number;
  buildParams: () => URLSearchParams;
  setError: (error: string | null) => void;
  loadError: string;
}) {
  /** The whole row is kept, so ticks survive paging to rows no longer on screen. */
  const [selected, setSelected] = useState<Map<string, LabRecordListItemDTO>>(new Map());

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

  /** A tick box's own click, with the shift state its mouse-down saw. */
  function toggleRowFromBox(record: LabRecordListItemDTO, index: number) {
    toggleRow(record, index, shiftHeld.current);
  }

  /** Saved on the tick box's mouse-down, for the change that follows it. */
  function noteShift(shiftKey: boolean) {
    shiftHeld.current = shiftKey;
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

  function clearSelection() {
    setSelected(new Map());
  }

  const selectedRecords = useMemo(() => [...selected.values()], [selected]);
  /** A sub-sample has no barcode of its own: what applies to a sample does not apply to it. */
  const selectedSamples = useMemo(() => selectedRecords.filter((record) => !record.parentId), [selectedRecords]);
  const selectedSubs = useMemo(() => selectedRecords.filter((record) => record.parentId), [selectedRecords]);

  const [isSelectingMatching, setIsSelectingMatching] = useState(false);
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
      const response = await fetch(withBasePath(`/api/lab-records?${params.toString()}`));
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

  return {
    selected,
    clearSelection,
    toggleRow,
    toggleRowFromBox,
    noteShift,
    allShownSelected,
    toggleShown,
    selectedRecords,
    selectedSamples,
    selectedSubs,
    isSelectingMatching,
    allMatchingSelected,
    selectAllMatching,
    selectionInTableOrder,
  };
}
