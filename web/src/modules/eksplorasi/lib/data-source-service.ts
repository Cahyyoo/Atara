import "server-only";
import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { ApiError } from "@/core/lib/http/api-response";
import { pageArgs, paginationOf } from "@/core/lib/http/pagination";
import {
  blankToNull,
  DATA_SOURCE_SELECT,
  dataSourceWhere,
  toDataSourceDTO,
  toDateColumn,
} from "@/modules/eksplorasi/lib/data-source";
import { campaignsCache, invalidateDataSourceCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import { assertKnownOriginal } from "@/modules/eksplorasi/lib/duplicate-originals";
import type {
  createDataSourceSchema,
  listDataSourceQuerySchema,
  sampleIdSearchQuerySchema,
  updateDataSourceSchema,
} from "@/modules/eksplorasi/validation";

/**
 * The data source as the API serves it: the routes check who is asking and
 * what was sent, and call these. Kept apart from the routes so the rules can
 * be read -- and changed -- in one place.
 */

type NewRow = z.output<typeof createDataSourceSchema>;
type RowChange = z.output<typeof updateDataSourceSchema>;

/** The text and date columns as the database stores them; blank text is no text. Fields not sent stay unsent. */
function columns(body: NewRow | RowChange) {
  const { date, ...rest } = body;
  const text = Object.fromEntries(
    Object.entries(rest).map(([field, value]) =>
      [field, field === "sampleId" || field === "sampleType" ? value : blankToNull(value as string | null | undefined)]
    )
  );
  return { ...text, ...(date !== undefined ? { date: toDateColumn(date) } : {}) };
}

/** One page of a list, newest assay first, by sample, hole, control or campaign. */
export async function listDataSource(query: z.output<typeof listDataSourceQuerySchema>) {
  const where = dataSourceWhere(query);
  const [total, rows] = await Promise.all([
    prisma.dataSource.count({ where }),
    prisma.dataSource.findMany({
      where,
      select: DATA_SOURCE_SELECT,
      orderBy: [{ createdAt: "desc" }, { sampleId: "asc" }],
      ...pageArgs(query),
    }),
  ]);
  return { rows: rows.map(toDataSourceDTO), pagination: paginationOf(total, query) };
}

/** The campaigns there are, for the lists' filter. A few dozen at most, held (eksplorasi-cache.ts). */
export function listCampaigns(): Promise<string[]> {
  return campaignsCache.get("campaigns", async () => {
    const rows = await prisma.dataSource.findMany({
      where: { campaign: { not: null } },
      distinct: ["campaign"],
      select: { campaign: true },
      orderBy: { campaign: "asc" },
      take: 500,
    });
    return rows.flatMap((row) => (row.campaign ? [row.campaign] : []));
  });
}

/**
 * The FIELD samples' Sample IDs holding the search, in order: what the
 * Duplicate list's Remarks is picked from. A page at most -- the data source
 * holds thousands -- so the dropdown asks again as more is typed.
 */
export async function searchFieldSampleIds({ search, limit }: z.output<typeof sampleIdSearchQuerySchema>): Promise<string[]> {
  const rows = await prisma.dataSource.findMany({
    where: { sampleType: "FIELD", ...(search ? { sampleId: { contains: search } } : {}) },
    select: { sampleId: true },
    orderBy: { sampleId: "asc" },
    take: limit,
  });
  return rows.map((row) => row.sampleId);
}

/** A new row. A sample ID already in use is a 409 (handleApiError, P2002); a Remarks naming no FIELD sample a 422. */
export async function createDataSource(body: NewRow, userId: string) {
  await assertKnownOriginal(body);
  const row = await prisma.dataSource.create({
    data: { ...(columns(body) as Omit<Prisma.DataSourceUncheckedCreateInput, "createdById">), createdById: userId },
    select: DATA_SOURCE_SELECT,
  });
  invalidateDataSourceCaches();
  return toDataSourceDTO(row);
}

export async function getDataSource(id: string) {
  const row = await prisma.dataSource.findUnique({ where: { id }, select: DATA_SOURCE_SELECT });
  if (!row) throw new ApiError("Sample not found.", 404);
  return toDataSourceDTO(row);
}

/** Changes only the fields sent. A missing row is a 404, a taken sample ID a 409, a Remarks naming no FIELD sample a 422. */
export async function updateDataSource(id: string, body: RowChange, userId: string) {
  await assertKnownOriginal(body);
  const row = await prisma.dataSource.update({
    where: { id },
    data: { ...(columns(body) as Prisma.DataSourceUncheckedUpdateInput), updatedById: userId },
    select: DATA_SOURCE_SELECT,
  });
  invalidateDataSourceCaches();
  return toDataSourceDTO(row);
}

/** Removed outright: nothing hangs off a row. */
export async function deleteDataSource(id: string) {
  await prisma.dataSource.delete({ where: { id } });
  invalidateDataSourceCaches();
  return { id };
}
