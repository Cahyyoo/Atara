/**
 * The data-quality checks and their options, with no server imports, so the
 * page offers exactly what the route accepts.
 */

export const QUALITY_CHECKS = ["identity", "results"] as const;
export type QualityCheck = (typeof QUALITY_CHECKS)[number];

/**
 * The identity columns a record can be missing. The first five are expected
 * on every sample; non-prod and SIR are only filled in for some, so they are
 * offered as filters but left out of "missing anything".
 */
export const IDENTITY_GAPS = [
  "place",
  "rockType",
  "pit",
  "bargingNo",
  "sampleIdent",
  "nonProd",
  "sir",
] as const;
export type IdentityGap = (typeof IDENTITY_GAPS)[number];

export const EXPECTED_GAPS: readonly IdentityGap[] = [
  "place",
  "rockType",
  "pit",
  "bargingNo",
  "sampleIdent",
];

/** "No results after N days": the choices offered. */
export const RESULT_AGE_DAYS = [1, 3, 7, 14] as const;
export const DEFAULT_RESULT_AGE_DAYS = 3;

export const QUALITY_PAGE_SIZE = 50;

export interface QualityRow {
  sampleCode: string;
  labCode: string;
  sampleIdent: string | null;
  createdAt: string;
  ageDays: number;
  stageKey: string | null;
  stageName: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  /** For the identity check: which of the columns are empty. */
  missing: IdentityGap[];
}

export interface QualitySummary {
  /** Records missing at least one expected column. */
  identity: number;
  /** Per column, including the optional ones. */
  byGap: Record<IdentityGap, number>;
  /** Records without a Ni result, older than the chosen age. */
  results: number;
  days: number;
}

export interface QualityList {
  summary: QualitySummary;
  rows: QualityRow[];
  total: number;
  page: number;
  totalPages: number;
}
