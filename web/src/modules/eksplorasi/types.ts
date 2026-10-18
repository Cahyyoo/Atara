/** What the Eksplorasi module's routes send to the browser. */

export type DrillHoleStatus = "PLANNED" | "ONGOING" | "COMPLETED" | "ABANDONED";

/** One drill hole of the Eksplorasi module; see drill-hole.ts. */
export interface DrillHoleDTO {
  id: string;
  holeId: string;
  area: string | null;
  easting: number | null;
  northing: number | null;
  elevation: number | null;
  azimuth: number | null;
  dip: number | null;
  totalDepth: number | null;
  status: DrillHoleStatus;
  /** YYYY-MM-DD. */
  startDate: string | null;
  /** YYYY-MM-DD. */
  endDate: string | null;
  remarks: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What a row of the drilling sheet would do: a new hole, a change, nothing, or something to fix. */
export type DrillSheetStatus = "create" | "update" | "unchanged" | "invalid";

/** The server's word on one row of the drilling sheet, by the row's line. */
export interface DrillSheetVerdict {
  line: number;
  status: DrillSheetStatus;
  /** The column at fault, on an invalid row; null for the row as a whole. */
  field?: string | null;
  message?: string;
}

export interface DrillSheetResult {
  rows: DrillSheetVerdict[];
  summary: Record<DrillSheetStatus, number>;
  /** Holes written: both zero on a dry run, or while any row is invalid. */
  created: number;
  updated: number;
}
