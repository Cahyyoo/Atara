import { normaliseHeader } from "@/core/lib/sheets/csv-parse";
import type { SheetColumn } from "@/core/lib/sheets/xlsx";

/**
 * The drilling sheet's columns, in one list for the export, the template and
 * the importer -- so a file the app writes is a file the app reads back, and
 * a header renamed here is renamed everywhere at once.
 *
 * Pure: the import dialog lists the same columns in the browser.
 */

export const DRILL_HOLE_FIELDS = [
  "holeId",
  "area",
  "status",
  "easting",
  "northing",
  "elevation",
  "azimuth",
  "dip",
  "totalDepth",
  "startDate",
  "endDate",
  "remarks",
] as const;
export type DrillHoleField = (typeof DRILL_HOLE_FIELDS)[number];

export const DRILL_HOLE_NUMBER_FIELDS = [
  "easting",
  "northing",
  "elevation",
  "azimuth",
  "dip",
  "totalDepth",
] as const satisfies readonly DrillHoleField[];
export type DrillHoleNumberField = (typeof DRILL_HOLE_NUMBER_FIELDS)[number];

/** What the export and the template write on row 1. */
export const DRILL_HOLE_COLUMNS: (SheetColumn & { key: DrillHoleField })[] = [
  { header: "Hole ID", key: "holeId", width: 16 },
  { header: "Area", key: "area", width: 18 },
  { header: "Status", key: "status", width: 12 },
  { header: "Easting", key: "easting", width: 14 },
  { header: "Northing", key: "northing", width: 14 },
  { header: "Elevation (m)", key: "elevation", width: 13 },
  { header: "Azimuth (°)", key: "azimuth", width: 11 },
  { header: "Dip (°)", key: "dip", width: 9 },
  { header: "Total Depth (m)", key: "totalDepth", width: 15 },
  { header: "Start Date", key: "startDate", width: 12 },
  { header: "End Date", key: "endDate", width: 12 },
  { header: "Remarks", key: "remarks", width: 32 },
];

/**
 * Every header the importer recognises, normalised (`normaliseHeader` drops
 * case, the bracketed unit and anything that is not a letter or digit). The
 * exported names first, then the Indonesian ones from the screen, then the
 * usual spreadsheet spellings.
 */
const ALIASES: Record<DrillHoleField, string[]> = {
  holeId: ["Hole ID", "HoleID", "Hole", "Hole No", "Hole Number", "No Lubang", "Lubang Bor", "BHID", "DHID"],
  area: ["Area", "Area / Prospek", "Prospek", "Prospect", "Blok", "Block"],
  status: ["Status"],
  easting: ["Easting", "East", "X"],
  northing: ["Northing", "North", "Y"],
  elevation: ["Elevation", "Elevasi", "RL", "Z", "Collar RL"],
  azimuth: ["Azimuth", "Azimut", "Az"],
  dip: ["Dip", "Inclination", "Inklinasi"],
  totalDepth: ["Total Depth", "Kedalaman Total", "Kedalaman", "Depth", "Max Depth", "EOH"],
  startDate: ["Start Date", "Tanggal Mulai", "Mulai", "Start"],
  endDate: ["End Date", "Tanggal Selesai", "Selesai", "End"],
  remarks: ["Remarks", "Catatan", "Keterangan", "Notes", "Comment"],
};

const BY_HEADER = new Map<string, DrillHoleField>(
  (Object.entries(ALIASES) as [DrillHoleField, string[]][]).flatMap(([field, names]) =>
    names.map((name) => [normaliseHeader(name), field] as const)
  )
);

/** The field a header names, or null for a column the importer ignores. */
export function fieldForHeader(header: string): DrillHoleField | null {
  return BY_HEADER.get(normaliseHeader(header)) ?? null;
}
