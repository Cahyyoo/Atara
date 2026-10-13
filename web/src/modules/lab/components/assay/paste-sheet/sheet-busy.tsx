"use client";

import { IoReloadOutline } from "react-icons/io5";

/**
 * Said while the sheet is busy -- laying down a big paste, saving -- over the
 * grid, so a pause reads as work in progress rather than as a frozen screen.
 */
export function SheetBusy({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-[1px] animate-in fade-in-0 duration-150"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-card px-5 py-3 text-sm font-medium shadow-raised ring-1 ring-border/60">
        <IoReloadOutline aria-hidden className="size-4 animate-spin text-primary" />
        {label}
      </div>
    </div>
  );
}

/**
 * How far the server has got through checking the sheet: measured, batch by
 * batch, so five thousand rows show steady progress instead of a spinner that
 * might as well be stuck.
 */
export function SheetProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div role="status" aria-live="polite" className="flex min-w-60 items-center gap-2.5 text-xs text-muted-foreground">
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={label}
        className="relative h-1.5 w-32 overflow-clip rounded-full bg-muted"
      >
        {/* Never quite empty: the bar is moving even before the first batch is back. */}
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </span>
      {label}
    </div>
  );
}

/** Rows the outline draws: about a screenful, all of them plain blocks. */
const SKELETON_ROWS = 12;

/**
 * The sheet's outline, drawn while the dialog opens: its real headings over a
 * dozen shimmering rows, and not one input. Light enough not to cost the
 * opening animation a frame; shaped like the sheet, so the real one takes its
 * place without anything moving.
 */
export function SheetSkeleton({ columns }: { columns: readonly string[] }) {
  return (
    <div aria-hidden className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">
      <div className="flex h-12 items-center gap-4 border-b bg-muted px-3 text-xs font-semibold whitespace-nowrap text-foreground/70">
        <span className="w-12 shrink-0">No.</span>
        {columns.slice(0, 10).map((label, index) => (
          <span key={label} className={index === 0 ? "w-60 shrink-0 text-center" : "w-24 shrink-0 text-center"}>
            {label}
          </span>
        ))}
      </div>
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <div key={row} className="flex h-9 items-center gap-4 border-b border-border/50 px-3">
          <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground/60">{row + 1}</span>
          <span className="skeleton-sheen h-3 w-56 shrink-0 rounded-full bg-muted" />
          <span className="skeleton-sheen h-3 w-24 shrink-0 rounded-full bg-muted/70" />
          <span className="skeleton-sheen h-3 w-20 shrink-0 rounded-full bg-muted/60" />
          <span className="skeleton-sheen h-3 w-20 shrink-0 rounded-full bg-muted/50" />
        </div>
      ))}
    </div>
  );
}
