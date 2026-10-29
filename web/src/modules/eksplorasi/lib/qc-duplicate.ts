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

/**
 * The RPD charts' two lines, as the lab's QC workbook draws them: a pair at
 * 20% RPD or more is marked on the RPD graph, and the distribution is read
 * against 10% -- the CRM List's preferred value for a duplicate (RPD <=10%).
 */
export const RPD_FLAG = 0.2;
export const RPD_LIMIT = 0.1;

/**
 * Relative percent difference: how far apart the two readings are, as a share
 * of their mean -- |duplicate − original| / ((duplicate + original) / 2).
 * Unlike the ±10% band it takes neither reading as the truth, and it is never
 * past 2 (200%) for readings of one sign. Two zeros agree; null when the
 * mean is zero and the readings are not.
 */
export function rpd({ x, y }: Pick<DuplicatePair, "x" | "y">): number | null {
  const mean = Math.abs(x + y) / 2;
  if (mean === 0) return x === y ? 0 : null;
  return Math.abs(y - x) / mean;
}

/** A pair's RPD at its place in the pairs' order (1-based), as the RPD graph plots it. */
export interface RpdPoint {
  index: number;
  sampleId: string;
  originalId: string;
  rpd: number;
}

/** The pairs' RPDs in their order -- the earliest duplicate first -- leaving out a pair with none. */
export function rpdSeries(pairs: readonly DuplicatePair[]): RpdPoint[] {
  const points: RpdPoint[] = [];
  pairs.forEach((pair, position) => {
    const value = rpd(pair);
    if (value !== null) points.push({ index: position + 1, sampleId: pair.sampleId, originalId: pair.originalId, rpd: value });
  });
  return points;
}

/** At or past the RPD graph's mark; exactly 20% is marked (float noise forgiven). */
export const isRpdFlagged = (point: Pick<RpdPoint, "rpd">) => point.rpd >= RPD_FLAG - 1e-9;

/** Within the CRM List's 10%; exactly 10% is still within. */
export const isRpdWithin = (point: Pick<RpdPoint, "rpd">) => point.rpd <= RPD_LIMIT + 1e-9;

/**
 * The RPD distribution: the RPDs from smallest to largest, each at the share
 * of pairs (0–1) with an RPD no larger -- where the curve crosses 10% reads
 * how many pairs are within it.
 */
export function rpdDistribution(points: readonly RpdPoint[]): (RpdPoint & { cumulative: number })[] {
  const n = points.length;
  return [...points].sort((a, b) => a.rpd - b.rpd || a.index - b.index).map((point, rank) => ({ ...point, cumulative: (rank + 1) / n }));
}

/** A month ("2026-10") as the dates it holds: from its first day, up to but not including the next month's. */
export function monthRange(month: string): { from: string; to: string } {
  const [year, number] = month.split("-").map(Number);
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

const figures = (values: readonly number[]) =>
  values.length === 0
    ? { mean: null, min: null, max: null }
    : {
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };

/** One row of the duplicate table. */
export interface DuplicateSummary {
  /** Every duplicate paired with its original, whether or not this element is a number on both. */
  nSamples: number;
  /** The pairs on the RPD graph: both readings numbers, with an RPD. */
  rpdSamples: number;
  /** Their mean RPD, as a share (0.0438 is 4.38%); null with none. */
  averageRpd: number | null;
  original: { mean: number | null; min: number | null; max: number | null };
  duplicate: { mean: number | null; min: number | null; max: number | null };
}

/**
 * The duplicate table's row for one element, as the lab's QC workbook has it:
 * how many pairs there are, how many have an RPD and its mean, and the
 * originals' and duplicates' mean and range over the pairs drawn.
 */
export function duplicateSummary(pairs: readonly DuplicatePair[], skipped: number): DuplicateSummary {
  const rpds = rpdSeries(pairs);
  return {
    nSamples: pairs.length + skipped,
    rpdSamples: rpds.length,
    averageRpd: rpds.length === 0 ? null : rpds.reduce((sum, point) => sum + point.rpd, 0) / rpds.length,
    original: figures(pairs.map((pair) => pair.x)),
    duplicate: figures(pairs.map((pair) => pair.y)),
  };
}
