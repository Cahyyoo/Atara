/**
 * Checking only what changed.
 *
 * The server's verdict on a row depends on what the row says and on what is
 * stored -- never on the other rows -- so a verdict can be kept by the row's
 * text and reused until that text changes. A paste of five thousand rows is
 * checked once; after that, fixing one box sends one row, not five thousand.
 * Saving still sends the whole sheet, and the server checks all of it again
 * then, inside the transaction that writes it.
 *
 * The one thing that does depend on the other rows -- two rows with the same
 * results -- is worked out here, over the whole sheet (sheetDuplicates); the
 * server's own answer to that covers only the batch it was sent.
 */
import { isFilledLine, rowLine, sheetLabel, type SheetRow } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { ASSAY_KEYS, assayKey, groupDuplicates } from "@/modules/lab/lib/records/assay-duplicates";
import { parseNumber } from "@/core/lib/number-parse";
import type { ImportPreviewDTO, ImportPreviewRow } from "@/modules/lab/types";

/** Rows sent to the server in one check: big enough to be few requests, small enough to show progress. */
export const CHECK_BATCH = 1000;

/** A verdict with its line number dropped: the number belongs to a request, the verdict to a row's text. */
export type Verdict = Omit<ImportPreviewRow, "line">;

const lines = new WeakMap<SheetRow, { keys: string; line: string }>();

/**
 * A row as one line of the import, worked out once per row object: a row that
 * did not change is the same object (the sheet copies only the rows it
 * edits), so typing in one box recomputes one line, not five thousand.
 */
export function lineOf(row: SheetRow, keys: readonly string[]): string {
  const signature = keys.join("\t");
  const known = lines.get(row);
  if (known && known.keys === signature) return known.line;
  const line = rowLine(row, keys);
  lines.set(row, { keys: signature, line });
  return line;
}

/** The lines on the sheet with something in them that have no verdict yet, each once. */
export function pendingLines(rows: readonly SheetRow[], keys: readonly string[], cache: ReadonlyMap<string, Verdict>): string[] {
  const pending = new Set<string>();
  for (const row of rows) {
    const line = lineOf(row, keys);
    if (isFilledLine(line) && !cache.has(line)) pending.add(line);
  }
  return [...pending];
}

/** What is sent to check a batch: the header, then the lines in order (line n + 2 is lines[n]). */
export function checkText(keys: readonly string[], batch: readonly string[]): string {
  return [keys.map(sheetLabel).join("\t"), ...batch].join("\n");
}

/** The server's answer to a batch, kept by each line's text. */
export function rememberVerdicts(cache: Map<string, Verdict>, batch: readonly string[], rows: readonly ImportPreviewRow[]) {
  for (const { line, ...verdict } of rows) {
    const text = batch[line - 2];
    if (text !== undefined) cache.set(text, verdict);
  }
}

/** Forgets the verdicts of lines no longer on the sheet, so the cache never outgrows it. */
export function pruneVerdicts(cache: Map<string, Verdict>, rows: readonly SheetRow[], keys: readonly string[]) {
  const live = new Set(rows.map((row) => lineOf(row, keys)));
  for (const line of cache.keys()) if (!live.has(line)) cache.delete(line);
}

/**
 * The rows about to be written whose results read exactly like another such
 * row's on this sheet, each with the numbers of the rows it matches.
 */
export function sheetDuplicates(
  rows: readonly SheetRow[],
  keys: readonly string[],
  cache: ReadonlyMap<string, Verdict>
): Map<SheetRow, number[]> {
  const assayColumns = keys.filter((key) => (ASSAY_KEYS as string[]).includes(key));
  const keyed: { id: number; key: string | null }[] = [];
  rows.forEach((row, index) => {
    const status = cache.get(lineOf(row, keys))?.status;
    if (status !== "update" && status !== "create") return;
    const values = Object.fromEntries(assayColumns.map((key) => [key, parseNumber((row[key] ?? "").trim())]));
    keyed.push({ id: index + 1, key: assayKey(values) });
  });
  const groups = groupDuplicates(keyed);
  return new Map([...groups].map(([number, others]) => [rows[number - 1], others]));
}

export interface SheetProgress {
  /** Rows with something in them. */
  filled: number;
  /** Of those, the ones with a verdict. */
  checked: number;
  /** Counted as the server counts them, once every filled row has a verdict. */
  summary: ImportPreviewDTO["summary"] | null;
}

/** The sheet's verdicts counted the way the import counts them (route.ts, `summary`). */
export function progressOf(
  rows: readonly SheetRow[],
  keys: readonly string[],
  cache: ReadonlyMap<string, Verdict>,
  duplicates: ReadonlyMap<SheetRow, number[]> = new Map()
): SheetProgress {
  const summary = { total: 0, update: 0, create: 0, unchanged: 0, unknown: 0, invalid: 0, overwrite: 0, duplicate: 0 };
  let filled = 0;
  let checked = 0;
  for (const row of rows) {
    const line = lineOf(row, keys);
    if (!isFilledLine(line)) continue;
    filled++;
    const verdict = cache.get(line);
    if (!verdict) continue;
    checked++;
    summary.total++;
    summary[verdict.status]++;
    if ((verdict.overwrites?.length ?? 0) > 0) summary.overwrite++;
    if (duplicates.has(row) || (verdict.duplicateOf?.length ?? 0) > 0) summary.duplicate++;
  }
  return { filled, checked, summary: filled > 0 && checked === filled ? summary : null };
}
