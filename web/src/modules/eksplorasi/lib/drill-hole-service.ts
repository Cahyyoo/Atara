import "server-only";
import type { z } from "zod";
import { prisma } from "@/core/lib/prisma";
import { ApiError } from "@/core/lib/http/api-response";
import { pageArgs, paginationOf } from "@/core/lib/http/pagination";
import {
  blankToNull,
  DRILL_HOLE_SELECT,
  drillHoleWhere,
  toDateColumn,
  toDrillHoleDTO,
} from "@/modules/eksplorasi/lib/drill-hole";
import type {
  createDrillHoleSchema,
  listDrillHolesQuerySchema,
  updateDrillHoleSchema,
} from "@/modules/eksplorasi/validation";

/**
 * The drill holes as the API serves them: the routes check who is asking and
 * what was sent, and call these. Kept apart from the routes so the rules can
 * be read -- and changed -- in one place.
 */

type NewHole = z.output<typeof createDrillHoleSchema>;
type HoleChange = z.output<typeof updateDrillHoleSchema>;

/** The text and date columns as the database stores them; blank text is no text. */
function columns<T extends NewHole | HoleChange>(body: T) {
  return {
    ...body,
    area: blankToNull(body.area),
    remarks: blankToNull(body.remarks),
    startDate: toDateColumn(body.startDate),
    endDate: toDateColumn(body.endDate),
  };
}

/** The holes on one page of the list, newest first, by hole ID or area and by status. */
export async function listDrillHoles(query: z.output<typeof listDrillHolesQuerySchema>) {
  const where = drillHoleWhere(query);
  const [total, rows] = await Promise.all([
    prisma.drillHole.count({ where }),
    prisma.drillHole.findMany({
      where,
      select: DRILL_HOLE_SELECT,
      orderBy: [{ createdAt: "desc" }, { holeId: "asc" }],
      ...pageArgs(query),
    }),
  ]);
  return { drillHoles: rows.map(toDrillHoleDTO), pagination: paginationOf(total, query) };
}

/** A new hole. A hole ID already in use is a 409 (handleApiError, P2002). */
export async function createDrillHole(body: NewHole, userId: string) {
  const row = await prisma.drillHole.create({
    data: { ...columns(body), createdById: userId },
    select: DRILL_HOLE_SELECT,
  });
  return toDrillHoleDTO(row);
}

export async function getDrillHole(id: string) {
  const row = await prisma.drillHole.findUnique({ where: { id }, select: DRILL_HOLE_SELECT });
  if (!row) throw new ApiError("Drill hole not found.", 404);
  return toDrillHoleDTO(row);
}

/**
 * Changes only the fields sent. When only one of the two dates is sent, their
 * order is checked against the one already stored.
 */
export async function updateDrillHole(id: string, body: HoleChange, userId: string) {
  if ((body.startDate === undefined) !== (body.endDate === undefined)) {
    const current = await prisma.drillHole.findUnique({
      where: { id },
      select: { startDate: true, endDate: true },
    });
    if (!current) throw new ApiError("Drill hole not found.", 404);
    const start = body.startDate !== undefined ? body.startDate : current.startDate?.toISOString().slice(0, 10);
    const end = body.endDate !== undefined ? body.endDate : current.endDate?.toISOString().slice(0, 10);
    if (start && end && end < start) {
      throw new ApiError("End date cannot be before the start date.", 422);
    }
  }

  const row = await prisma.drillHole.update({
    where: { id },
    data: { ...columns(body), updatedById: userId },
    select: DRILL_HOLE_SELECT,
  });
  return toDrillHoleDTO(row);
}

/** Removed outright: drill holes have nothing hanging off them yet. */
export async function deleteDrillHole(id: string) {
  await prisma.drillHole.delete({ where: { id } });
  return { id };
}
