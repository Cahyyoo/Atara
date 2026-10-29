import { parseNumber } from "@/core/lib/number-parse";
import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { BlankPoint } from "@/modules/eksplorasi/types";

/**
 * The blank charts: each blank sample's reading in the order the blanks were
 * taken, against the most a blank may read -- the CRM List's Preferred Value
 * -- and the table of how many read past it. Pure, so the arithmetic can be
 * checked without a database.
 */

/** The elements the CRM List holds a blank limit for, in its order -- one chart and one table row each. */
export const BLANK_ELEMENTS = ["ni", "co", "fe2o3", "cr2o3"] as const satisfies readonly ControlElement[];
export type BlankElement = (typeof BLANK_ELEMENTS)[number];

/** "<0.01", "< 0.01", "<=0.01", "≤0.01": below what the method can measure, and the limit it gives. */
const BELOW = /^\s*(?:<=?|≤)\s*(.+)$/;

/**
 * A blank's reading as a number. A blank should read nothing, so most come
 * back as "<0.01" -- below the detection limit. Such a reading is taken at
 * the limit itself (0.01), as the lab's QC workbook does, and marked so; a
 * number the lab wrote out, however small, is taken as written. Null for
 * anything else (blank, "n/a").
 */
export function blankValue(text: string | null | undefined): { value: number; belowDetection: boolean } | null {
  if (text === null || text === undefined) return null;
  const below = BELOW.exec(text);
  const value = parseNumber(below ? below[1] : text);
  return value === null ? null : { value, belowDetection: below !== null };
}

/** The CRM List's Preferred Value, as the lab writes it: "0.01", "<0.01" and "<=0.01" are all 0.01. */
export function blankLimit(text: string | null | undefined): number | null {
  return blankValue(text)?.value ?? null;
}

/**
 * Each blank's reading of one element at its Sample Index -- its place among
 * the blanks shown, counting from 1, so the axis runs to the number of
 * blanks. A reading that is not a number is left off and counted.
 */
export function blankPoints(
  rows: readonly { sampleId: string; value: string | null }[]
): { points: BlankPoint[]; skipped: number } {
  const points: BlankPoint[] = [];
  let skipped = 0;
  rows.forEach((row, position) => {
    const reading = blankValue(row.value);
    if (reading === null) skipped += 1;
    else points.push({ sampleId: row.sampleId, x: position + 1, y: reading.value, belowDetection: reading.belowDetection });
  });
  return { points, skipped };
}

/** Past the Preferred Value; a reading at it is still a pass (float noise forgiven). */
export const isAnomaly = (point: Pick<BlankPoint, "y">, limit: number) => point.y > limit + 1e-9;

export interface BlankSummary {
  n: number;
  /** Null with no readings. */
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Readings past the Preferred Value; null when the CRM List has none to judge against. */
  anomalies: number | null;
  /** As a share of the readings (0–1). */
  anomalyShare: number | null;
}

/** One row of the blank table: the readings' count, mean, range, and how many are past the limit. */
export function blankSummary(points: readonly Pick<BlankPoint, "y">[], limit: number | null): BlankSummary {
  const n = points.length;
  if (n === 0) return { n, mean: null, min: null, max: null, anomalies: limit === null ? null : 0, anomalyShare: null };
  const values = points.map((point) => point.y);
  const anomalies = limit === null ? null : points.filter((point) => isAnomaly(point, limit)).length;
  return {
    n,
    mean: values.reduce((sum, value) => sum + value, 0) / n,
    min: Math.min(...values),
    max: Math.max(...values),
    anomalies,
    anomalyShare: anomalies === null ? null : anomalies / n,
  };
}
