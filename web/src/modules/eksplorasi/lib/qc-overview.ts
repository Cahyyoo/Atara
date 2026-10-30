import { OUTSIDE_2SD_LIMIT } from "@/modules/eksplorasi/lib/qc-control";
import { blankSummary } from "@/modules/eksplorasi/lib/qc-blank";
import { isRpdFlagged, rpdSeries } from "@/modules/eksplorasi/lib/qc-duplicate";
import type { QcBlank, QcControl, QcDuplicate } from "@/modules/eksplorasi/types";

/**
 * What each of the dashboard's tabs counts on its label: the things in it
 * that want a look, for the elements shown, worked out from what its table
 * and charts already hold -- so a problem is seen before the tab is opened.
 * The same marks the section itself draws in red. Pure, so the counting can
 * be checked without a page.
 */

/** Standard × element rows with more than 5% of their assays past ±2 SD. */
export function standardAttention(summary: QcControl["summary"]): number {
  return summary.flatMap((entry) => entry.rows).filter((row) => (row.outside2 ?? 0) > OUTSIDE_2SD_LIMIT + 1e-9).length;
}

/** Blank readings past the CRM List's Preferred Value. */
export function blankAttention(elements: QcBlank["elements"]): number {
  return elements.reduce((total, entry) => total + (blankSummary(entry.points, entry.limit).anomalies ?? 0), 0);
}

/** Duplicate pairs at 20% RPD or more -- the red points of the RPD graphs. */
export function duplicateAttention(elements: QcDuplicate["elements"]): number {
  return elements.reduce((total, entry) => total + rpdSeries(entry.pairs).filter(isRpdFlagged).length, 0);
}
