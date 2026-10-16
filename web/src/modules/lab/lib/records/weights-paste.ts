/**
 * Moisture-content weighings copied out of a spreadsheet: Sample ID, Wp, W0,
 * Wd -- the columns of the weighings sheet, and how a pasted header names them.
 *
 * A header row is optional. With one, the columns may be in any order and
 * other columns are ignored; without one, the block is laid down from the box
 * it was pasted into, as Excel would (spreadPaste). Pure, so it can be checked
 * without a clipboard.
 */
import { normaliseHeader } from "@/core/lib/sheets/csv-parse";

export const WEIGHT_KEYS = ["wp", "w0", "wd"] as const;
export type WeightKey = (typeof WEIGHT_KEYS)[number];

/** The sheet's columns, left to right. */
export const WEIGHTS_SHEET_KEYS = ["sampleIdent", ...WEIGHT_KEYS] as const;

const KEY_HEADERS = new Set(["sampleid", "sampleident", "idsampel", "sample", "labcode", "kodelab"]);
const WEIGHT_HEADERS: Record<string, WeightKey> = { wp: "wp", w0: "w0", wo: "w0", wd: "wd" };

/**
 * The columns a header row names, by position; null when the row is data.
 * A Lab Code column is read as the Sample ID: the weighings are matched on
 * either, as a results paste is.
 */
export function weightsHeader(row: string[]): { index: number; key: string }[] | null {
  const columns = row.flatMap((cell, index) => {
    const name = normaliseHeader(cell);
    if (KEY_HEADERS.has(name)) return [{ index, key: "sampleIdent" }];
    if (name in WEIGHT_HEADERS) return [{ index, key: WEIGHT_HEADERS[name] }];
    return [];
  });
  return columns.length > 0 ? columns : null;
}
