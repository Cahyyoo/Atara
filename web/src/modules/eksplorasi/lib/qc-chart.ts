import { parseNumber } from "@/core/lib/number-parse";
import type { DuplicatePair, StandardPoint } from "@/modules/eksplorasi/types";

/**
 * The dashboard's two scatter plots, from rows to points. Pure, so what is
 * drawn -- and what is left out, and why -- can be checked without a database.
 *
 * Values are text as the lab wrote them. One that is not a number ("<0.01",
 * "n/a", blank) is a result but not a point, and is counted as skipped rather
 * than drawn as zero.
 */

/** A value as a number for the chart, or null when it is not one. */
export function chartValue(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return parseNumber(value);
}

export interface StandardRow {
  sampleId: string;
  control: string | null;
  /** YYYY-MM-DD. */
  date: string | null;
  value: string | null;
}

/**
 * Each STANDARD assay as (date, value), grouped by the CRM it is (its
 * control). One with no date, no control or no number has nowhere to go.
 */
export function standardPoints(rows: readonly StandardRow[]): { points: StandardPoint[]; skipped: number } {
  const points: StandardPoint[] = [];
  let skipped = 0;
  for (const row of rows) {
    const y = chartValue(row.value);
    const control = row.control?.trim();
    if (y === null || !row.date || !control) {
      skipped += 1;
      continue;
    }
    points.push({ sampleId: row.sampleId, control, x: Date.parse(`${row.date}T00:00:00Z`), y });
  }
  return { points, skipped };
}

/** The CRMs on the chart, in a stable order, each with its points. */
export function byControl(points: readonly StandardPoint[]): { control: string; points: StandardPoint[] }[] {
  const groups = new Map<string, StandardPoint[]>();
  for (const point of points) {
    const group = groups.get(point.control);
    if (group) group.push(point);
    else groups.set(point.control, [point]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([control, list]) => ({ control, points: list }));
}

export interface DuplicateRow {
  sampleId: string;
  /** The sample ID of the sample it repeats. */
  control: string | null;
  value: string | null;
}

/**
 * Each DUPLICATE beside the sample it repeats: x the original, y the
 * duplicate, so a perfect repeat sits on the 1:1 line. The original is found
 * by its sample ID (case aside, as the unique index compares them) in
 * `originals`, keyed lower-case.
 */
export function duplicatePairs(
  duplicates: readonly DuplicateRow[],
  originals: ReadonlyMap<string, { sampleId: string; value: string | null }>
): { pairs: DuplicatePair[]; unmatched: number; skipped: number } {
  const pairs: DuplicatePair[] = [];
  let unmatched = 0;
  let skipped = 0;
  for (const duplicate of duplicates) {
    const key = duplicate.control?.trim().toLowerCase();
    const original = key ? originals.get(key) : undefined;
    if (!original) {
      unmatched += 1;
      continue;
    }
    const x = chartValue(original.value);
    const y = chartValue(duplicate.value);
    if (x === null || y === null) {
      skipped += 1;
      continue;
    }
    pairs.push({ sampleId: duplicate.sampleId, originalId: original.sampleId, x, y });
  }
  return { pairs, unmatched, skipped };
}

/** The ends of the 1:1 line: from the smallest value on either axis to the largest. */
export function oneToOne(pairs: readonly DuplicatePair[]): [number, number] | null {
  if (pairs.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const { x, y } of pairs) {
    min = Math.min(min, x, y);
    max = Math.max(max, x, y);
  }
  return [min, max];
}
