/** The dashboard's figures as the browser receives them, and the filter that narrows them. Pure: the charts import this. */
import type { SubFilter } from "@/modules/lab/validation/records";

/**
 * The bar for samples that have no place yet. Not a place, so it is deliberately
 * not given one of the categorical hues — the chart colours those by position,
 * and letting this take one would read as a site that does not exist.
 */
export const UNPLACED_ID = "__unplaced__";
export const UNPLACED_CODE = "—";
// and the two must stay in step.

export interface AnalyticsResult {
  range: { from: string; to: string };
  /**
   * When these figures were worked out. Cached answers keep the time they
   * were computed, so "updated at" on the dashboard never claims fresher
   * data than it has.
   */
  generatedAt: string;
  kpi: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    awaitingAssay: number;
    overdue: number;
    averageCycleHours: number | null;
  };
  throughput: { shiftDate: string; created: number; completed: number }[];
  /**
   * Stage rows carry the key as well as the stored name. The server has
   * no locale, so it must not be the thing that picks the words: left to
   * the name alone, the dashboard charts would stay in one language
   * whatever the app is set to.
   */
  stageDurations: {
    stageId: string;
    stageKey: string | null;
    stageName: string;
    averageHours: number;
    samples: number;
  }[];
  bottleneck: { stageId: string; stageKey: string | null; stageName: string; count: number }[];
  niDistribution: { bucket: string; count: number }[];
  /**
   * One entry per place, plus a trailing one for samples that have no place
   * yet, so the bars add up to the total the KPI card shows.
   */
  placeSplit: { placeId: string; code: string; count: number }[];
  overdueSamples: {
    sampleCode: string;
    labCode: string | null;
    /** What the sample is — place, rock type, pit, barging run — in one string. */
    sampleIdent: string | null;
    stageKey: string | null;
    stageName: string;
    hoursInStage: number;
    slaHours: number;
  }[];
}

/**
 * Every figure on the dashboard is an aggregate, so every figure is aggregated
 * in the database. Only the overdue list needs row-level data, and that is
 * filtered and capped before it leaves MySQL.
 */
export interface AnalyticsFilter {
  placeId?: string;
  rockTypeId?: string;
  nonProdId?: string;
  pitId?: string;
  sirId?: string;
  /**
   * Which records the result figures count: the samples (default), every
   * record, or the sub-samples alone. Barcode and stage counts are always
   * per sample -- a sub-sample is not a container of its own.
   */
  subs?: SubFilter;
}
