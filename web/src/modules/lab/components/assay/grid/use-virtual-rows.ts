"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The rows of a long list that are actually on screen.
 *
 * Five thousand rows of twenty boxes is a hundred thousand inputs: the browser
 * would spend seconds laying them out and every keystroke after that. With a
 * fixed row height the visible slice is plain arithmetic, so only those rows
 * (and a few either side, so a fast scroll never shows a gap) are rendered,
 * between two spacers that keep the scrollbar honest.
 */
export function windowOf(
  scrollTop: number,
  viewport: number,
  rowCount: number,
  rowHeight: number,
  overscan: number
): { start: number; end: number; padTop: number; padBottom: number } {
  // A list that just got shorter (the sheet cleared while scrolled to its
  // end) still remembers the old scroll position until the browser says
  // otherwise; read past the end, it would render nothing at all.
  const top = Math.min(scrollTop, Math.max(0, rowCount * rowHeight - viewport));
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const last = Math.min(rowCount, Math.ceil((top + viewport) / rowHeight) + overscan);
  return { start: first, end: last, padTop: first * rowHeight, padBottom: Math.max(0, (rowCount - last) * rowHeight) };
}

export function useVirtualRows({
  rowCount,
  rowHeight,
  overscan = 8,
  /** Rows taken up by a sticky header inside the scroller. */
  headerHeight = 0,
}: {
  rowCount: number;
  rowHeight: number;
  overscan?: number;
  headerHeight?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // A first guess, corrected as soon as the box is measured.
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = () => setViewport(scroller.clientHeight || 600);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => setScrollTop(scrollerRef.current?.scrollTop ?? 0), []);

  /** Brings a row into view: for moving to a box that is not rendered yet. */
  const scrollToRow = useCallback(
    (row: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const top = row * rowHeight;
      const bottom = top + rowHeight + headerHeight;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
      setScrollTop(scroller.scrollTop);
    },
    [rowHeight, headerHeight]
  );

  return { scrollerRef, onScroll, scrollToRow, ...windowOf(scrollTop, viewport, rowCount, rowHeight, overscan) };
}
