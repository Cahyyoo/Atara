"use client";

import type { CSSProperties } from "react";
import { usePersistedColumns } from "@/core/hooks/use-persisted-columns";

/**
 * The sheet's preferences, remembered in this browser: how big its text is,
 * and whether valid rows are saved on their own. Kept through the column
 * store (a one-item list) rather than a store of their own.
 */

export const TEXT_SIZES = ["sm", "md", "lg", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/**
 * Each size's text, box, row and headings heights, in px. `md` is the sheet
 * as it always was; a larger screen has wider columns for the larger sizes,
 * a smaller one fits the headings on one line with `sm`.
 */
const METRICS: Record<TextSize, { font: number; box: number; row: number; head: number }> = {
  sm: { font: 10, box: 28, row: 32, head: 44 },
  md: { font: 11, box: 32, row: 36, head: 48 },
  lg: { font: 13, box: 36, row: 40, head: 56 },
  xl: { font: 15, box: 40, row: 44, head: 64 },
};

const SIZE_FALLBACK: readonly TextSize[] = ["md"];
const AUTOSAVE_CHOICES = ["on", "off"] as const;
const AUTOSAVE_FALLBACK: readonly (typeof AUTOSAVE_CHOICES)[number][] = ["on"];

export function useSheetTextSize() {
  const [stored, setStored] = usePersistedColumns("atara.eksplorasi.sheetTextSize.v1", SIZE_FALLBACK, TEXT_SIZES);
  const size: TextSize = stored[0] ?? "md";
  const at = TEXT_SIZES.indexOf(size);
  const metrics = METRICS[size];
  return {
    size,
    headingsHeight: metrics.head,
    /** The CSS variables the grid draws its boxes with. */
    style: {
      "--sheet-font": `${metrics.font}px`,
      "--sheet-box-h": `${metrics.box}px`,
      "--sheet-row-h": `${metrics.row}px`,
      "--sheet-head-h": `${metrics.head}px`,
    } as CSSProperties,
    canShrink: at > 0,
    canGrow: at < TEXT_SIZES.length - 1,
    shrink: () => at > 0 && setStored([TEXT_SIZES[at - 1]]),
    grow: () => at < TEXT_SIZES.length - 1 && setStored([TEXT_SIZES[at + 1]]),
  };
}

export function useAutosavePreference(): [boolean, (on: boolean) => void] {
  const [stored, setStored] = usePersistedColumns("atara.eksplorasi.sheetAutosave.v1", AUTOSAVE_FALLBACK, AUTOSAVE_CHOICES);
  return [stored[0] !== "off", (on) => setStored([on ? "on" : "off"])];
}
