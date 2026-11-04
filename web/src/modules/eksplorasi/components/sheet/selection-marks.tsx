import type { GridRange } from "@/core/hooks/use-grid-selection";
import { cn } from "@/core/lib/utils";

/** The fill handle: Excel's small square, centred on the corner of the selection's frame, dragged down to copy. */
const FILL_HANDLE = "absolute -right-[4px] -bottom-[4px] z-10 size-1.5 cursor-crosshair bg-primary ring-1 ring-background";

/** "left:right:top:bottom" (top/bottom 1 or 0) for a row in the selection, for its frame; else null -- cheap for a memoised row to compare. */
export function frameOf(range: GridRange | null, row: number): string | null {
  if (!range || row < range.top || row > range.bottom) return null;
  return `${range.left}:${range.right}:${row === range.top ? 1 : 0}:${row === range.bottom ? 1 : 0}`;
}

/** The edges of the frame a box draws: those it has on the selection's outside. */
function frameEdges(frame: string | null, col: number): string | null {
  if (frame === null) return null;
  const [left, right, top, bottom] = frame.split(":").map(Number);
  if (col < left || col > right) return null;
  return cn(top === 1 && "border-t-2", bottom === 1 && "border-b-2", col === left && "border-l-2", col === right && "border-r-2") || null;
}

/**
 * What a box draws of the selection, as Excel draws it: its part of one 2px
 * frame round the whole range, and -- at the frame's last corner -- the fill
 * handle.
 */
export function SelectionMarks({ frame, col, handle }: { frame: string | null; col: number; handle: boolean }) {
  const edges = frameEdges(frame, col);
  return (
    <>
      {edges ? (
        <span aria-hidden data-selection-frame className={cn("pointer-events-none absolute inset-0 z-[5] border-primary", edges)} />
      ) : null}
      {handle ? <span data-fill-handle aria-hidden className={FILL_HANDLE} /> : null}
    </>
  );
}
