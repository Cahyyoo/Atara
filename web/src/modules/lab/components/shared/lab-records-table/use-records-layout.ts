"use client";

import { useMemo, useState } from "react";
import { usePersistedColumns } from "@/core/hooks/use-persisted-columns";
import { useTableLayout } from "@/core/hooks/use-table-layout";
import { clampWidth, moveBefore, normalizeOrder, nudge } from "@/core/lib/ui/column-layout";
import { ASSAY_TABLE_FIELDS } from "@/modules/lab/lib/records/assay";
import {
  ALL_COLUMNS,
  CHEVRON_WIDTH,
  DEFAULT_ORDER,
  DEFAULT_WIDTHS,
  TICK_WIDTH,
  type Column,
  type Movable,
} from "@/modules/lab/components/shared/lab-records-table/columns";

/** Which columns show, in what order, how wide -- and dragging them about. */
export function useRecordsLayout(mode: "database" | "assay", canSelect: boolean, isAssay: boolean) {
  const [visibleFields, setVisibleFields] = usePersistedColumns<Column>(
    "atara.columns.database",
    ASSAY_TABLE_FIELDS,
    ALL_COLUMNS
  );

  /**
   * How the columns are arranged: the order somebody dragged them into and the
   * widths they set, remembered per page in this browser. Shift date and
   * status are always shown; the element and instrument columns as chosen.
   */
  const [layout, setLayout] = useTableLayout("atara.table-layout." + mode);
  const columnOrder = useMemo(() => normalizeOrder(layout.order, DEFAULT_ORDER) as Movable[], [layout.order]);
  const shownColumns = columnOrder.filter(
    (key) => key === "shiftDate" || key === "status" || visibleFields.includes(key)
  );
  /** A width being dragged: shown live, saved once the edge is let go. */
  const [draftWidth, setDraftWidth] = useState<{ key: string; width: number } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const widthOf = (key: string) =>
    draftWidth?.key === key ? draftWidth.width : (layout.widths[key] ?? DEFAULT_WIDTHS[key] ?? 120);
  const tableWidth =
    (canSelect ? TICK_WIDTH : 0) +
    widthOf("sample") +
    shownColumns.reduce((total, key) => total + widthOf(key), 0) +
    (isAssay ? 0 : CHEVRON_WIDTH);

  function resizeColumn(key: string, width: number, final: boolean) {
    if (!final) {
      setDraftWidth({ key, width });
      return;
    }
    setDraftWidth(null);
    setLayout({ ...layout, widths: { ...layout.widths, [key]: clampWidth(width) } });
  }

  function resetColumnWidth(key: string) {
    const widths = { ...layout.widths };
    delete widths[key];
    setLayout({ ...layout, widths });
  }

  function moveColumn(key: string, target: string) {
    setLayout({ ...layout, order: moveBefore(columnOrder, key, target) });
  }

  function nudgeColumn(key: string, step: -1 | 1) {
    setLayout({ ...layout, order: nudge(columnOrder, shownColumns, key, step) });
  }

  function toggleField(field: Column) {
    setVisibleFields(
      visibleFields.includes(field)
        ? visibleFields.filter((key) => key !== field)
        : [...visibleFields, field]
    );
  }

  /** The drag-and-drop half of every reorderable heading's props. */
  const dragProps = {
    onResize: resizeColumn,
    onResetWidth: resetColumnWidth,
    onDragStartColumn: (key: string) => setDragKey(key),
    onDragOverColumn: (key: string) => setDropKey(dragKey && dragKey !== key ? key : null),
    onDropColumn: (key: string) => {
      if (dragKey && dragKey !== key) moveColumn(dragKey, key);
      setDragKey(null);
      setDropKey(null);
    },
    onDragEndColumn: () => {
      setDragKey(null);
      setDropKey(null);
    },
    onNudge: nudgeColumn,
  };

  return {
    visibleFields,
    setVisibleFields,
    toggleField,
    setLayout,
    shownColumns,
    dragKey,
    dropKey,
    widthOf,
    tableWidth,
    dragProps,
  };
}
