/** What the Eksplorasi module's routes send to the browser. */
import type { ElementField, SampleType } from "@/modules/eksplorasi/lib/data-source-columns";

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

/** One STANDARD assay on the CRM chart: when (ms since epoch) and what it read. */
export interface StandardPoint {
  sampleId: string;
  control: string;
  x: number;
  y: number;
}

/** One DUPLICATE beside the sample it repeats. */
export interface DuplicatePair {
  sampleId: string;
  originalId: string;
  /** The original's value. */
  x: number;
  /** The duplicate's value. */
  y: number;
}

/** The dashboard's two charts for one element. */
export interface QcCharts {
  element: ElementField;
  standard: {
    points: StandardPoint[];
    /** STANDARD rows left off the chart: no date, no control, or a value that is not a number. */
    skipped: number;
    /** More rows than the chart draws; the oldest are shown. */
    truncated: boolean;
  };
  duplicate: {
    pairs: DuplicatePair[];
    /** DUPLICATE rows whose control names no sample in the data source. */
    unmatched: number;
    /** Pairs left off because either value is not a number. */
    skipped: number;
    truncated: boolean;
  };
}
