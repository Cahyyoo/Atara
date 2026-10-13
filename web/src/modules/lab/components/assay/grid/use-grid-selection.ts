"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { isBlock } from "@/modules/lab/lib/records/sheet-paste";

/** A rectangle of cells, by row and by column position on screen. */
export interface GridRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface Point {
  row: number;
  col: number;
}

interface Options {
  rowCount: number;
  colCount: number;
  /** Writes the boxes, for Delete and Cut over a selection. */
  clear: (range: GridRange) => void;
  /** Lays a pasted block (or one value over a selection) into the boxes. */
  paste: (text: string, range: GridRange) => void;
  /** The selection as Excel would copy it. */
  copyText: (range: GridRange) => string;
  /** For a grid that renders only the rows in view: scroll a row in first. */
  reveal?: (row: number) => void;
}

const span = (a: Point, b: Point): GridRange => ({
  top: Math.min(a.row, b.row),
  left: Math.min(a.col, b.col),
  bottom: Math.max(a.row, b.row),
  right: Math.max(a.col, b.col),
});

/** The box a DOM event came from, by the data-cell-* attributes every box carries. */
function cellOf(target: EventTarget | null): Point | null {
  if (!(target instanceof Element)) return null;
  const box = target.closest<HTMLElement>("[data-cell-row]");
  if (!box) return null;
  return { row: Number(box.dataset.cellRow), col: Number(box.dataset.cellCol) };
}

/** Whether the caret is where an arrow should leave the box rather than move inside it. */
function atEdge(input: HTMLInputElement, direction: "left" | "right"): boolean {
  if (input.type === "datetime-local") return false;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  // All of it selected is how a box looks when it was moved into, not typed in.
  if (start === 0 && end === input.value.length) return true;
  if (start !== end) return false;
  return direction === "left" ? start === 0 : end === input.value.length;
}

/**
 * Selecting, moving and copying across the boxes of a grid the way a
 * spreadsheet does.
 *
 * Click a box to type in it, as before. Drag, Shift+click or Shift+arrow to
 * take a rectangle; Ctrl+A for every box. Then Ctrl+C puts the rectangle on
 * the clipboard as Excel's own tab-separated text, Ctrl+X does that and empties
 * it, Delete empties it, and Ctrl+V lays a copied block down from its corner --
 * or fills all of it with one copied value. Arrows and Enter move box to box.
 *
 * Everything listens on the grid itself (event delegation), so a box carries
 * no handlers of its own beyond typing: only data-cell-row/-col, and
 * data-selected when it is inside the rectangle.
 */
export function useGridSelection({ rowCount, colCount, clear, paste, copyText, reveal }: Options) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The selection lives in refs as well as in state: state is what renders,
  // the refs are what a handler reads. Two events can arrive before React has
  // rendered between them -- a mousedown and the first mouseover of a quick
  // drag -- and the second must see what the first chose, not the render
  // before it.
  const anchorRef = useRef<Point | null>(null);
  const headRef = useRef<Point | null>(null);
  const [selection, setSelection] = useState<{ anchor: Point; head: Point } | null>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const select = useCallback((anchor: Point, head: Point = anchor) => {
    anchorRef.current = anchor;
    headRef.current = head;
    setSelection({ anchor, head });
  }, []);
  const currentRange = (): GridRange | null =>
    anchorRef.current && headRef.current ? span(anchorRef.current, headRef.current) : null;
  const isMultiRange = (range: GridRange | null) =>
    range !== null && (range.top !== range.bottom || range.left !== range.right);

  const range = selection ? span(selection.anchor, selection.head) : null;
  const isMulti = isMultiRange(range);

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
      setIsDragging(false);
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  const focusCell = useCallback(
    (point: Point) => {
      const enter = () => {
        const box = containerRef.current?.querySelector<HTMLInputElement>(
          `[data-cell-row="${point.row}"][data-cell-col="${point.col}"]`
        );
        box?.focus();
        box?.select?.();
        return box !== null && box !== undefined;
      };
      // A row outside a windowed grid is not rendered yet: scroll it in, then
      // move into it on the next frame, once it is there.
      if (!enter() && reveal) {
        reveal(point.row);
        requestAnimationFrame(enter);
      }
    },
    [reveal]
  );

  const clamp = (point: Point): Point => ({
    row: Math.max(0, Math.min(rowCount - 1, point.row)),
    col: Math.max(0, Math.min(colCount - 1, point.col)),
  });

  function onFocusCapture(event: { target: EventTarget | null }) {
    const cell = cellOf(event.target);
    // Shift+click and Shift+arrow extend without moving focus, and a drag
    // moves the mouse, not the focus: any focus that does arrive (a click,
    // Tab) starts again from that box.
    if (!cell || dragging.current) return;
    select(cell);
  }

  function onMouseDown(event: MouseEvent) {
    const cell = cellOf(event.target);
    if (!cell || event.button !== 0) return;
    if (event.shiftKey && anchorRef.current) {
      event.preventDefault();
      select(anchorRef.current, cell);
      return;
    }
    dragging.current = true;
    select(cell);
  }

  function onMouseOver(event: MouseEvent) {
    if (!dragging.current || !anchorRef.current) return;
    const cell = cellOf(event.target);
    const head = headRef.current;
    if (!cell || (head && head.row === cell.row && head.col === cell.col)) return;
    setIsDragging(true);
    window.getSelection()?.removeAllRanges();
    select(anchorRef.current, cell);
  }

  function onKeyDown(event: KeyboardEvent) {
    const cell = cellOf(event.target);
    if (!cell) return;
    const input = event.target as HTMLInputElement;
    const mod = event.ctrlKey || event.metaKey;
    const now = currentRange();

    // Typing over a selection types into the box that has focus, as Excel does.
    if (isMultiRange(now) && !mod && event.key.length === 1) {
      select(cell);
      return;
    }

    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      select({ row: 0, col: 0 }, { row: rowCount - 1, col: colCount - 1 });
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && now && isMultiRange(now)) {
      event.preventDefault();
      clear(now);
      return;
    }

    const step: Record<string, Point> = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    };
    if (event.shiftKey && step[event.key]) {
      event.preventDefault();
      const from = headRef.current ?? cell;
      select(anchorRef.current ?? cell, clamp({ row: from.row + step[event.key].row, col: from.col + step[event.key].col }));
      return;
    }

    let move: Point | null = null;
    if (event.key === "Enter") move = { row: event.shiftKey ? -1 : 1, col: 0 };
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // A date-time box uses the arrows for its own fields.
      if (input.type !== "datetime-local") move = step[event.key];
    } else if (event.key === "ArrowLeft" && atEdge(input, "left")) move = step.ArrowLeft;
    else if (event.key === "ArrowRight" && atEdge(input, "right")) move = step.ArrowRight;
    if (!move) return;

    event.preventDefault();
    const next = clamp({ row: cell.row + move.row, col: cell.col + move.col });
    select(next);
    focusCell(next);
  }

  function hasTextSelection(target: EventTarget | null): boolean {
    const input = target as HTMLInputElement | null;
    return !!input && typeof input.selectionStart === "number" && input.selectionStart !== input.selectionEnd;
  }

  function onCopy(event: ClipboardEvent) {
    const now = currentRange();
    if (!now || (!isMultiRange(now) && hasTextSelection(event.target))) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", copyText(now));
  }

  function onCut(event: ClipboardEvent) {
    const now = currentRange();
    if (!now || (!isMultiRange(now) && hasTextSelection(event.target))) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", copyText(now));
    clear(now);
  }

  function onPaste(event: ClipboardEvent) {
    const cell = cellOf(event.target);
    if (!cell) return;
    const now = currentRange();
    const text = event.clipboardData.getData("text/plain");
    // Plain text into one box is the box's own business.
    if (!isBlock(text) && !isMultiRange(now)) return;
    event.preventDefault();
    paste(text, now ?? { top: cell.row, left: cell.col, bottom: cell.row, right: cell.col });
  }

  /** "left:right" for a row inside a multi-cell selection, else null: cheap for a memoised row to compare. */
  const top = range?.top ?? -1;
  const bottom = range?.bottom ?? -1;
  const left = range?.left ?? -1;
  const right = range?.right ?? -1;
  const selectionFor = useCallback(
    (row: number): string | null => (isMulti && row >= top && row <= bottom ? `${left}:${right}` : null),
    [isMulti, top, bottom, left, right]
  );

  return {
    containerRef,
    range,
    isMulti,
    selectionFor,
    containerProps: {
      ref: containerRef,
      onFocusCapture,
      onMouseDown,
      onMouseOver,
      onKeyDown,
      onCopy,
      onCut,
      onPaste,
      "data-dragging": isDragging ? "" : undefined,
    },
  };
}

/** Whether column `col` falls in a row's "left:right" selection. */
export function inSelection(selection: string | null, col: number): boolean {
  if (selection === null) return false;
  const [left, right] = selection.split(":").map(Number);
  return col >= left && col <= right;
}
