"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useGridSelection, type GridRange } from "@/modules/lab/components/assay/grid/use-grid-selection";
import type { CellField, InstrumentColumn, RowValues } from "@/modules/lab/components/assay/results-grid";
import { ALL_COLUMNS, type Column } from "@/modules/lab/components/assay/results-entry-utils";
import { rangeToTsv, spreadPaste } from "@/modules/lab/lib/records/sheet-paste";
import type { AssayFieldSpec } from "@/modules/lab/lib/records/assay";
import type { LabRecordListItemDTO } from "@/modules/lab/types";

/**
 * Excel's clipboard in the entry grid: a block copied out of the instrument's
 * sheet is pasted straight into the boxes -- from the box it lands in, or by
 * its header when it has one -- and a selected block of boxes copies back out
 * as rows and columns Excel lays down the same way.
 *
 * Only the ticked samples are rows here, so a block longer than them leaves
 * the rest out and says how many (`ignored`). Whatever lands goes through the
 * same values as typing, so it is tinted, checked and asked about on save
 * exactly as anything typed.
 */
export function useResultsClipboard({
  records,
  values,
  setValues,
  columns,
  instrumentColumns,
  showRemarks,
  visible,
  setVisible,
}: {
  records: LabRecordListItemDTO[];
  values: Record<string, RowValues>;
  setValues: Dispatch<SetStateAction<Record<string, RowValues>>>;
  columns: AssayFieldSpec[];
  instrumentColumns: InstrumentColumn[];
  showRemarks: boolean;
  visible: Column[];
  setVisible: (next: Column[]) => void;
}) {
  const [ignored, setIgnored] = useState(0);

  // The columns as numbered on screen, left to right.
  const keys = useMemo<CellField[]>(
    () => [
      ...columns.map((field) => field.key),
      ...instrumentColumns.map((field) => field.key),
      ...(showRemarks ? (["remarks"] as const) : []),
    ],
    [columns, instrumentColumns, showRemarks]
  );

  const write = useCallback(
    (writes: { row: number; key: string; value: string }[]) => {
      if (writes.length === 0) return;
      setValues((previous) => {
        const next = { ...previous };
        for (const { row, key, value } of writes) {
          const id = records[row]?.id;
          if (!id || !next[id] || !(key in next[id])) continue;
          next[id] = { ...next[id], [key]: value };
        }
        return next;
      });
    },
    [records, setValues]
  );

  const clear = useCallback(
    (range: GridRange) => {
      const writes = [];
      for (let row = range.top; row <= range.bottom; row++) {
        for (let col = range.left; col <= range.right; col++) {
          if (keys[col]) writes.push({ row, key: keys[col], value: "" });
        }
      }
      write(writes);
    },
    [keys, write]
  );

  const paste = useCallback(
    (text: string, range: GridRange) => {
      const result = spreadPaste(text, {
        visible: keys,
        known: ALL_COLUMNS,
        start: { row: range.top, col: range.left },
        rowCount: records.length,
        range,
      });
      // A column the sheet's header filled must be on screen before it is saved.
      const reveal = result.hiddenFilled.filter((key): key is Column => (ALL_COLUMNS as string[]).includes(key));
      if (reveal.length > 0) setVisible([...visible, ...reveal.filter((key) => !visible.includes(key))]);
      write(result.writes);
      setIgnored(result.extraRows);
    },
    [keys, records.length, setVisible, visible, write]
  );

  const copyText = useCallback(
    (range: GridRange) => rangeToTsv(range, keys, (row, key) => values[records[row]?.id]?.[key as CellField] ?? ""),
    [keys, records, values]
  );

  const grid = useGridSelection({ rowCount: records.length, colCount: keys.length, clear, paste, copyText });

  return { ...grid, ignored };
}
