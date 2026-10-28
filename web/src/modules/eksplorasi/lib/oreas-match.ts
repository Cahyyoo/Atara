import { chartValue } from "@/modules/eksplorasi/lib/qc-chart";

/**
 * Which OREAS standard a row's assay is, when its values are the CRM List's.
 *
 * Used where results are entered -- the sheet as it is typed in, and the
 * server as it saves a sheet or an import -- to fill the row's Remarks
 * (oreas_remarks) with the standard's name. Pure and import-free, so the
 * browser and the server apply exactly one rule.
 */

/** The elements compared: all five must be numbers and the same on both sides. */
export const MATCH_ELEMENTS = ["ni", "co", "fe2o3", "al2o3", "cr2o3"] as const;
export type MatchElement = (typeof MATCH_ELEMENTS)[number];

/** A CRM List standard as the match reads it: its name and the five values, as text. */
export type OreasStandard = { standard: string } & Partial<Record<MatchElement, string | null>>;

/** Numbers equal once read: "0.71" is "0.710". Only float noise is forgiven, nothing a lab would round. */
const EPSILON = 1e-9;

const same = (a: string | null | undefined, b: string | null | undefined) => {
  const x = chartValue(a);
  const y = chartValue(b);
  return x !== null && y !== null && Math.abs(x - y) <= EPSILON;
};

/**
 * The name of the one standard whose five values a row's equal, or null.
 *
 * A CRM row missing any of the five can never match. The same name under two
 * test methods (XRF and ICP) is one answer; two different names matching is
 * no answer -- guessing between them would be worse than leaving it blank.
 */
export function matchOreas(
  values: Partial<Record<MatchElement, string | null | undefined>>,
  standards: readonly OreasStandard[]
): string | null {
  const names = new Set<string>();
  for (const standard of standards) {
    if (MATCH_ELEMENTS.every((element) => same(values[element], standard[element]))) names.add(standard.standard);
  }
  return names.size === 1 ? [...names][0] : null;
}

/** The standards' names, once each and in order: the Remarks dropdown's choices. */
export function oreasNames(standards: readonly OreasStandard[]): string[] {
  return [...new Set(standards.map((standard) => standard.standard))].sort((a, b) => a.localeCompare(b));
}

/** Blank text is no remark: what the fill looks for before it writes. */
export const isBlankRemark = (value: string | null | undefined) => (value ?? "").trim() === "";
