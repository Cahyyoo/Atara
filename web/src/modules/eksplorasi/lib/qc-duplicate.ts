import { chartValue, type ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { DuplicatePair } from "@/modules/eksplorasi/types";

/**
 * The duplicate charts: each DUPLICATE against the FIELD sample its Remarks
 * names, the ±10% band the lab holds a duplicate to, and the straight line
 * through the pairs with its R². Pure, so the arithmetic can be checked
 * without a database.
 */

/** How far a duplicate may read from its original, as a share of the original. */
export const DUPLICATE_TOLERANCE = 0.1;

/** A duplicate and its original, as the database hands them over: the values as text. */
export type DuplicateRow = { sampleId: string; originalId: string } & Record<
  `${"d" | "o"}_${ControlElement}`,
  string | null
>;

/** One element's pairs; a value that is not a number ("<0.01", blank) leaves its pair off, counted. */
export function duplicatePairs(
  rows: readonly DuplicateRow[],
  element: ControlElement
): { pairs: DuplicatePair[]; skipped: number } {
  const pairs: DuplicatePair[] = [];
  let skipped = 0;
  for (const row of rows) {
    const x = chartValue(row[`o_${element}`]);
    const y = chartValue(row[`d_${element}`]);
    if (x === null || y === null) skipped += 1;
    else pairs.push({ sampleId: row.sampleId, originalId: row.originalId, x, y });
  }
  return { pairs, skipped };
}

/** The duplicate's difference from its original, as a share of the original: 0.05 is 5% higher. */
export const relativeDifference = ({ x, y }: Pick<DuplicatePair, "x" | "y">) => (x === 0 ? (y === 0 ? 0 : Infinity) : (y - x) / Math.abs(x));

/** Past ±10%; exactly 10% is still within (float noise forgiven). */
export const isOutsideTolerance = (pair: Pick<DuplicatePair, "x" | "y">) =>
  Math.abs(relativeDifference(pair)) > DUPLICATE_TOLERANCE + 1e-9;

/**
 * The least-squares line through the pairs, and how well it fits (R²).
 * Null when there is no line to draw: fewer than two pairs, or every
 * original the same. R² is 1 when every duplicate lies on the line.
 */
export function linearFit(pairs: readonly Pick<DuplicatePair, "x" | "y">[]): { slope: number; intercept: number; r2: number } | null {
  const n = pairs.length;
  if (n < 2) return null;
  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / n;
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const { x, y } of pairs) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

/**
 * One range for both axes, so the 1:1 direction is the diagonal and the band
 * reads true: from 0 when every value is positive (as an assay is), with a
 * little room above the highest. Null with no pairs.
 */
export function pairRange(pairs: readonly Pick<DuplicatePair, "x" | "y">[]): { min: number; max: number } | null {
  if (pairs.length === 0) return null;
  const values = pairs.flatMap((pair) => [pair.x, pair.y]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || Math.abs(high) || 1) * 0.05;
  return { min: low >= 0 ? 0 : low - pad, max: high + pad };
}
