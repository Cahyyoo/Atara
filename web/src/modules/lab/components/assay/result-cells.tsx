"use client";

import type { KeyboardEvent } from "react";
import { Input } from "@/core/components/ui/input";
import { cn } from "@/core/lib/utils";

/**
 * The boxes results are typed into, shared by the two ways of laying them out.
 *
 * A few samples are shown as a form -- every column at once, no scrolling
 * sideways -- and more than a few as a grid, where a column can be read down
 * and compared. Same cells either way, which is why they live here: two copies
 * of an input this particular would drift, and the drift would be silent. The
 * text-not-number choice, the decimal keypad and the "this changed" tint are
 * all decisions that have to hold in both.
 */

interface CellProps {
  id: string;
  /** Read aloud as "SMPL-2026-00091 Ni", so a box is never just "a box". */
  ariaLabel: string;
  value: string;
  /** Tints the box when it differs from what was loaded. */
  changed: boolean;
  /** Where the box sits, row and column on screen: what selecting and pasting read. */
  row: number;
  col: number;
  /** Inside a selected rectangle. */
  selected?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

const CHANGED_TINT = "bg-amber-100/70 dark:bg-amber-500/15";
/** A box inside a selected rectangle, drawn over whatever tint it has. */
const SELECTED = "data-[selected]:bg-primary/15 data-[selected]:ring-1 data-[selected]:ring-primary/50";

/** The attributes every box carries, so the grid can tell which box an event came from. */
function cellData(row: number, col: number, selected?: boolean) {
  return { "data-cell-row": row, "data-cell-col": col, "data-selected": selected ? "" : undefined };
}

export function AssayInput({
  id,
  ariaLabel,
  value,
  changed,
  row,
  col,
  selected,
  className,
  problem,
  problemLabel,
  onChange,
  onKeyDown,
}: CellProps & { problem: string | null; problemLabel?: string }) {
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      /**
       * Text rather than number, deliberately.
       *
       * A number box drops "1,86" to empty -- a comma is the decimal mark in
       * an Indonesian sheet -- and changes the value under the arrow keys and
       * the scroll wheel, which is a result nobody meant to type.
       */
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-invalid={problem ? true : undefined}
      title={problem ? problemLabel : undefined}
      {...cellData(row, col, selected)}
      className={cn("h-8 text-right tabular-nums", changed && !problem && CHANGED_TINT, SELECTED, className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

export function InstrumentInput({
  id,
  ariaLabel,
  value,
  changed,
  row,
  col,
  selected,
  className,
  kind,
  onChange,
  onKeyDown,
}: CellProps & { kind: "text" | "datetime" }) {
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      type={kind === "datetime" ? "datetime-local" : "text"}
      {...cellData(row, col, selected)}
      className={cn("h-8", changed && CHANGED_TINT, SELECTED, className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

export function RemarksInput({
  id,
  ariaLabel,
  value,
  changed,
  row,
  col,
  selected,
  className,
  onChange,
  onKeyDown,
}: CellProps) {
  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      {...cellData(row, col, selected)}
      className={cn("h-8", changed && CHANGED_TINT, SELECTED, className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
