/** What the Eksplorasi module's routes send to the browser. */
import type { ElementField, SampleType } from "@/modules/eksplorasi/lib/data-source-columns";
import type { ControlElement, StandardFigures } from "@/modules/eksplorasi/lib/qc-control";
import type { BlankElement } from "@/modules/eksplorasi/lib/qc-blank";

export type { DataSourceField, DataSourceView, ElementField, SampleType } from "@/modules/eksplorasi/lib/data-source-columns";

/** One row of the data source; see data-source.ts. Values are text, as the lab writes them. */
export type DataSourceDTO = {
  id: string;
  controlDate: string | null;
  control: string | null;
  campaign: string | null;
  no: string | null;
  holeId: string | null;
  sampleId: string;
  sampleType: SampleType;
  from: string | null;
  to: string | null;
  /** The Duplicate list's Remarks. */
  originalSampleIdRemarks: string | null;
  /** The Data Source, Standard and Blank lists' Remarks. */
  oreasRemarks: string | null;
  /** YYYY-MM-DD. */
  date: string | null;
  weight: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
} & Record<ElementField, string | null>;

/** What a row of the sheet would do: a new row, a change, nothing, or something to fix. */
export type SheetStatus = "create" | "update" | "unchanged" | "invalid";

/** The server's word on one row of the sheet, by the row's line. */
export interface SheetVerdict {
  line: number;
  status: SheetStatus;
  /** The column at fault, on an invalid row; null for the row as a whole. */
  field?: string | null;
  message?: string;
}

export interface SheetResult {
  rows: SheetVerdict[];
  summary: Record<SheetStatus, number>;
  /** Rows written: both zero on a dry run, or while any row is invalid. */
  created: number;
  updated: number;
}

export type { CrmKind } from "@/modules/eksplorasi/lib/crm-list-columns";

/**
 * One row of a CRM List table (see crm-list-columns.ts for each table's
 * fields). Values are text, as the lab writes them.
 */
export type CrmRowDTO = {
  id: string;
  updatedAt: string;
} & Record<string, string | null>;

/** A standard's certified value from the CRM List, and the lines ±1σ, ±2σ and ±3σ about it. */
export interface ControlLimits {
  certified: number;
  sd: number;
  plus1: number;
  minus1: number;
  plus2: number;
  minus2: number;
  plus3: number;
  minus3: number;
}

/** One assay of a standard on its control chart. */
export interface ControlPoint {
  sampleId: string;
  /** YYYY-MM-DD. */
  date: string | null;
  /** The sample index: the row's place in the data source, counting from 1. */
  x: number;
  y: number;
}

/** One row of the standard table: a CRM standard's assays of one element, about its certified value. */
export interface StandardSummaryRow extends StandardFigures {
  /** The CRM List's name for it. */
  standard: string;
  /** The CRM List's certified value and SD; null when it holds none that is a number. */
  certified: number | null;
  sd: number | null;
  /** The Remarks written for this standard and element, shared by every campaign. */
  remarks: string | null;
}

/** The control charts of one OREAS standard: one per element it is certified for. */
export interface QcControl {
  /** Every standard the CRM List has for the test method, for the "Oreas Criteria" choice. */
  standards: string[];
  /** The one shown; null when the CRM List has none yet. */
  standard: string | null;
  /** The campaigns that have standards, for the "Campaign Criteria" choice. */
  campaigns: string[];
  /** The one shown, for the charts and the table; null for every campaign. */
  campaign: string | null;
  testMethod: string;
  /** The standard table: per element, a row for each standard the CRM List certifies. */
  summary: { element: ControlElement; rows: StandardSummaryRow[] }[];
  elements: {
    element: ControlElement;
    /** Null when the CRM List has no usable value or SD for this element. */
    limits: ControlLimits | null;
    points: ControlPoint[];
    /** Assays of this standard whose value is not a number. */
    skipped: number;
  }[];
  /** More assays than the charts draw; the earliest are shown. */
  truncated: boolean;
}

/** One DUPLICATE against the FIELD sample its Remarks names. */
export interface DuplicatePair {
  /** The duplicate's Sample ID. */
  sampleId: string;
  /** The original's Sample ID (the duplicate's Remarks). */
  originalId: string;
  /** The original's value. */
  x: number;
  /** The duplicate's value. */
  y: number;
}

/** The duplicate charts: one per element, each duplicate against its original. */
export interface QcDuplicate {
  /** The campaigns that have duplicates, for the "Campaign Criteria" choice. */
  campaigns: string[];
  /** The months (YYYY-MM, latest first) of the duplicates' dates, for the "Month Criteria" choice. */
  months: string[];
  /** The ones shown; null for all. */
  campaign: string | null;
  month: string | null;
  elements: {
    element: ControlElement;
    pairs: DuplicatePair[];
    /** Pairs left off because either value is not a number. */
    skipped: number;
  }[];
  /** Duplicates whose Remarks names no FIELD sample: blank, free text, or a Sample ID not in the data source. */
  unmatched: number;
  /** More pairs than the charts draw; the earliest are shown. */
  truncated: boolean;
}

/** One blank's reading of an element, at its Sample Index. */
export interface BlankPoint {
  sampleId: string;
  /** The blank's place among the blanks shown, counting from 1. */
  x: number;
  y: number;
  /** Written as "<0.01" and taken at the detection limit. */
  belowDetection: boolean;
}

/** The blank charts and table: every BLANK of one campaign (or all), against the CRM List's Preferred Value. */
export interface QcBlank {
  /** The campaigns that have blanks, for the "Campaign Criteria" choice. */
  campaigns: string[];
  /** The one shown; null for every campaign. */
  campaign: string | null;
  elements: {
    element: BlankElement;
    /** The CRM List's Preferred Value; null when it holds none that is a number. */
    limit: number | null;
    points: BlankPoint[];
    /** Blanks whose reading of this element is not a number. */
    skipped: number;
  }[];
  /** More blanks than the charts draw; the earliest are shown. */
  truncated: boolean;
}
