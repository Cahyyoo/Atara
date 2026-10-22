"use client";

import { useMemo, useState } from "react";
import { usePersistedColumns } from "@/core/hooks/use-persisted-columns";
import { EMPTY_LAYOUT, useTableLayout } from "@/core/hooks/use-table-layout";
import { moveBefore, normalizeOrder, nudge } from "@/core/lib/ui/column-layout";
import {
  ARRANGEABLE,
  DEFAULT_VISIBLE,
  LOCKED_COLUMNS,
  arrangeColumns,
  columnWidths,
  type ListColumn,
} from "@/modules/eksplorasi/components/list-columns";
import type { DataSourceView } from "@/modules/eksplorasi/lib/data-source-columns";

/**
 * Which columns a list shows and in what order, as the lab's sample database
 * does it: drag a heading onto another (or Alt+←/→), tick columns on and off
 * (the assay results start off). Remembered per list in this browser. Nothing is
 * resized: the shown columns share the page's width, so the list still fits
 * without scrolling sideways.
 */
export function useListLayout(view: DataSourceView) {
  const defaults = ARRANGEABLE[view];
  // v3: the assay results became hidden by default; a choice saved before that is let go.
  const [visible, setVisible] = usePersistedColumns<ListColumn>(
    `atara.columns.eksplorasi.v3.${view}`,
    DEFAULT_VISIBLE[view],
    defaults
  );
  const [layout, setLayout] = useTableLayout(`atara.table-layout.eksplorasi.${view}`);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const order = useMemo(() => normalizeOrder(layout.order, defaults), [layout.order, defaults]);
  const columns = useMemo(() => arrangeColumns(view, layout.order, visible), [view, layout.order, visible]);
  const widths = useMemo(() => columnWidths(columns), [columns]);

  function moveColumn(key: string, target: string) {
    setLayout({ ...layout, order: moveBefore(order, key, target) });
  }

  function endDrag() {
    setDragKey(null);
    setDropKey(null);
  }

  /** The drag-and-drop half of every movable heading's props. */
  const dragProps = {
    onDragStartColumn: (key: string) => setDragKey(key),
    onDragOverColumn: (key: string) => setDropKey(dragKey && dragKey !== key ? key : null),
    onDropColumn: (key: string) => {
      if (dragKey && dragKey !== key) moveColumn(dragKey, key);
      endDrag();
    },
    onDragEndColumn: endDrag,
    onNudge: (key: string, step: -1 | 1) => setLayout({ ...layout, order: nudge(order, columns, key, step) }),
  };

  return {
    columns,
    widths,
    /** Every movable column in its current place, for the column menu. */
    order: order as ListColumn[],
    visible,
    isLocked: (column: ListColumn) => LOCKED_COLUMNS.includes(column),
    toggle: (column: ListColumn) =>
      setVisible(visible.includes(column) ? visible.filter((key) => key !== column) : [...visible, column]),
    showAll: () => setVisible([...defaults]),
    /** Back to the list's usual columns, in their usual order. */
    reset: () => {
      setVisible([...DEFAULT_VISIBLE[view]]);
      setLayout(EMPTY_LAYOUT);
    },
    dragKey,
    dropKey,
    dragProps,
  };
}
