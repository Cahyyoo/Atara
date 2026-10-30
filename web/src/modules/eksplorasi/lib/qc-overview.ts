import type { ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import { OUTSIDE_2SD_LIMIT } from "@/modules/eksplorasi/lib/qc-control";
import { blankSummary } from "@/modules/eksplorasi/lib/qc-blank";
import { duplicateSummary, isRpdFlagged, isRpdWithin, linearFit, rpdSeries } from "@/modules/eksplorasi/lib/qc-duplicate";
import type { QcBlank, QcControl, QcDuplicate } from "@/modules/eksplorasi/types";

/**
 * The dashboard's summary cards: each section's figures in a line, for the
 * elements shown, worked out from what its table and charts already hold.
 * `attention` is what the section's tab counts, so a problem is seen before
 * the tab is opened. Pure, so the arithmetic can be checked without a page.
 */

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export interface StandardOverview {
  /** Standard samples assayed: the most any one element has. */
  assays: number;
  /** Share (0–1) of the element assays within ±2 SD; null with no certified value to judge against. */
  within2: number | null;
  /** Element assays past ±3 SD. */
  outside3: number;
  /** Standard × element rows with more than 5% of their assays past ±2 SD. */
  flagged: number;
  attention: number;
}

export function standardOverview(summary: QcControl["summary"]): StandardOverview {
  const rows = summary.flatMap((entry) => entry.rows);
  const judged = rows.filter((row) => row.within2 !== null && row.n > 0);
  const judgedAssays = sum(judged.map((row) => row.n));
  const outside3 = sum(judged.map((row) => Math.round(row.n * (1 - (row.within3 ?? 1)))));
  const flagged = judged.filter((row) => (row.outside2 ?? 0) > OUTSIDE_2SD_LIMIT + 1e-9).length;
  return {
    assays: Math.max(0, ...summary.map((entry) => sum(entry.rows.map((row) => row.n)))),
    within2: judgedAssays === 0 ? null : sum(judged.map((row) => row.n * row.within2!)) / judgedAssays,
    outside3,
    flagged,
    attention: flagged,
  };
}

export interface BlankOverview {
  /** Blank samples with a reading: the most any one element has. */
  blanks: number;
  /** Readings past the Preferred Value, over the elements with one. */
  anomalies: number;
  /** Share (0–1) of those elements' readings; null with none judged. */
  anomalyShare: number | null;
  /** The elements with an anomaly, in the table's order. */
  elementsWithAnomaly: ControlElement[];
  attention: number;
}

export function blankOverview(elements: QcBlank["elements"]): BlankOverview {
  const judged = elements.filter((entry) => entry.limit !== null);
  const summaries = judged.map((entry) => ({ element: entry.element, ...blankSummary(entry.points, entry.limit) }));
  const anomalies = sum(summaries.map((entry) => entry.anomalies ?? 0));
  const readings = sum(summaries.map((entry) => entry.n));
  return {
    blanks: Math.max(0, ...elements.map((entry) => entry.points.length)),
    anomalies,
    anomalyShare: readings === 0 ? null : anomalies / readings,
    elementsWithAnomaly: summaries.filter((entry) => (entry.anomalies ?? 0) > 0).map((entry) => entry.element),
    attention: anomalies,
  };
}

export interface DuplicateOverview {
  /** Duplicates paired with their original: the most any one element has. */
  pairs: number;
  /** Share (0–1) of the pairs with an RPD that are within 10%; null with none. */
  withinRpd: number | null;
  /** Mean RPD (0–1) over every element's pairs; null with none. */
  averageRpd: number | null;
  /** The weakest fit among the elements shown, and whose it is; null where no element has a line. */
  lowestR2: { element: ControlElement; r2: number } | null;
  /** Pairs at 20% RPD or more -- the red points of the RPD graphs. */
  flagged: number;
  attention: number;
}

export function duplicateOverview(elements: QcDuplicate["elements"]): DuplicateOverview {
  const rpds = elements.flatMap((entry) => rpdSeries(entry.pairs));
  const fits = elements.flatMap((entry) => {
    const fit = linearFit(entry.pairs);
    return fit ? [{ element: entry.element, r2: fit.r2 }] : [];
  });
  const flagged = rpds.filter(isRpdFlagged).length;
  return {
    pairs: Math.max(0, ...elements.map((entry) => duplicateSummary(entry.pairs, entry.skipped).nSamples)),
    withinRpd: rpds.length === 0 ? null : rpds.filter(isRpdWithin).length / rpds.length,
    averageRpd: rpds.length === 0 ? null : sum(rpds.map((point) => point.rpd)) / rpds.length,
    lowestR2: fits.reduce<DuplicateOverview["lowestR2"]>((lowest, fit) => (lowest && lowest.r2 <= fit.r2 ? lowest : fit), null),
    flagged,
    attention: flagged,
  };
}
