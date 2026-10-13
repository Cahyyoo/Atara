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
