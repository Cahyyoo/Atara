"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { GridRange } from "@/core/hooks/use-grid-selection";

interface Point {
  row: number;
  col: number;
}

/** The handle of a grid that has one: the element a drag down starts from. */
const FILL_HANDLE = "[data-fill-handle]";

/** The row of the box an event came from, by the data-cell-row every box carries. */
function rowOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const box = target.closest<HTMLElement>("[data-cell-row]");
  return box ? Number(box.dataset.cellRow) : null;
}

/**
 * The fill handle of a grid given `fill`: dragged from the selection's
 * corner, down. The boxes it copies and the last row it reaches live in refs
 * for the handlers, as the selection's do; the rows it will fill, in state,
 * for the dashed preview. Let go below where it started, it fills them and
 * the selection grows over all of it; Esc lets go of it.
 */
export function useFillHandle(
  fill: ((source: GridRange, target: GridRange) => void) | undefined,
  rowCount: number,
  select: (anchor: Point, head?: Point) => void
) {
  const source = useRef<GridRange | null>(null);
  const to = useRef(-1);
  const [preview, setPreview] = useState<{ source: GridRange; to: number } | null>(null);
  // The latest `fill`, for the window's mouseup, which is listened to once.
  const fillRef = useRef(fill);
  useEffect(() => {
    fillRef.current = fill;
  });

  const cancel = useCallback(() => {
    source.current = null;
    to.current = -1;
    setPreview(null);
  }, []);

  useEffect(() => {
    const stop = () => {
      const from = source.current;
      const last = to.current;
      if (!from) return;
      cancel();
      if (last > from.bottom) {
        fillRef.current?.(from, { top: from.bottom + 1, left: from.left, bottom: last, right: from.right });
        select({ row: from.top, col: from.left }, { row: last, col: from.right });
      }
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [cancel, select]);

  /** A mousedown on the handle starts a drag from `range`; true when it was the handle's. */
  function start(event: MouseEvent, range: GridRange | null): boolean {
    if (!fill || event.button !== 0 || !(event.target instanceof Element) || !event.target.closest(FILL_HANDLE)) return false;
    if (!range) return true;
    // The drag is the handle's: no text selected, no box moved into.
    event.preventDefault();
    source.current = range;
    to.current = range.bottom;
    setPreview({ source: range, to: range.bottom });
    return true;
  }

  /** The drag reaching a box: down only, as above the source's last row there is nothing to fill. */
  function move(event: MouseEvent): boolean {
    const from = source.current;
    if (!from) return false;
    const row = rowOf(event.target);
    const last = row === null ? to.current : Math.max(from.bottom, Math.min(rowCount - 1, row));
    if (last !== to.current) {
      to.current = last;
      setPreview({ source: from, to: last });
    }
    return true;
  }

  function escape(event: KeyboardEvent): boolean {
    if (event.key !== "Escape" || !source.current) return false;
    event.preventDefault();
    cancel();
    return true;
  }

  /** "left:right" for a row the handle is being dragged over, else null. */
  const top = preview ? preview.source.bottom + 1 : -1;
  const bottom = preview?.to ?? -1;
  const left = preview?.source.left ?? -1;
  const right = preview?.source.right ?? -1;
  const previewFor = useCallback(
    (row: number): string | null => (row >= top && row <= bottom ? `${left}:${right}` : null),
    [top, bottom, left, right]
  );

  return { active: preview !== null, start, move, escape, previewFor };
}
