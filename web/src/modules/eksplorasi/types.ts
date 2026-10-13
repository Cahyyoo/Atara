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
