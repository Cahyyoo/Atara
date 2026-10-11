import type { Prisma } from "@prisma/client";
import type { DrillHoleDTO } from "@/types";

/** In the order a hole goes through them. */
export const DRILL_HOLE_STATUSES = ["PLANNED", "ONGOING", "COMPLETED", "ABANDONED"] as const;

/**
 * Every drill-hole response goes through this select and `toDrillHoleDTO`,
 * so the browser always gets plain numbers and YYYY-MM-DD dates rather than
 * Prisma's Decimal objects and midnight-UTC timestamps.
 */
export const DRILL_HOLE_SELECT = {
  id: true,
  holeId: true,
  area: true,
  easting: true,
  northing: true,
  elevation: true,
  azimuth: true,
  dip: true,
  totalDepth: true,
  status: true,
  startDate: true,
  endDate: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.DrillHoleSelect;

type DrillHoleRow = Prisma.DrillHoleGetPayload<{ select: typeof DRILL_HOLE_SELECT }>;

const num = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());
const day = (value: Date | null) => (value === null ? null : value.toISOString().slice(0, 10));

export function toDrillHoleDTO(row: DrillHoleRow): DrillHoleDTO {
  return {
    id: row.id,
    holeId: row.holeId,
    area: row.area,
    easting: num(row.easting),
    northing: num(row.northing),
    elevation: num(row.elevation),
    azimuth: num(row.azimuth),
    dip: num(row.dip),
    totalDepth: num(row.totalDepth),
    status: row.status,
    startDate: day(row.startDate),
    endDate: day(row.endDate),
    remarks: row.remarks,
    createdBy: row.createdBy?.name ?? null,
    updatedBy: row.updatedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A YYYY-MM-DD from the form, as the DATE column's value; null and undefined pass through. */
export function toDateColumn(value: string | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) return value;
  return new Date(`${value}T00:00:00.000Z`);
}

/** Blank text is no text: an emptied field clears the column. */
export function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return value === "" ? null : value;
}
