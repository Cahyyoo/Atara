import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { chunks } from "@/core/lib/batch";
import { toDateColumn } from "@/modules/eksplorasi/lib/drill-hole";
import type { DrillHoleImportRow, ImportRow } from "@/modules/eksplorasi/lib/drill-hole-import";

/**
 * Writing an imported sheet: tens of thousands of holes in a few dozen
 * statements rather than one statement per hole.
 *
 * Each chunk commits on its own. One transaction around 34,000 rows would
 * hold its locks for the whole write and hit the 30-second ceiling every
 * other write here uses; chunks keep each lock short, and the import is safe
 * to run again from the top if it stops halfway -- a hole that made it in is
 * matched by its hole ID the second time and updated, not duplicated.
 */

/** Rows per createMany. One INSERT each, well under MySQL's packet size. */
const CREATE_CHUNK = 1_000;
/** Rows per UPDATE ... JOIN: 13 placeholders each, far below the 65,535 cap. */
const UPDATE_CHUNK = 500;
/** Hole IDs per lookup. */
const LOOKUP_CHUNK = 1_000;

/** The holes that already exist, by lower-cased hole ID -- how the unique index compares them. */
export async function findExistingHoles(holeIds: string[]): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  for (const ids of chunks(holeIds, LOOKUP_CHUNK)) {
    const rows = await prisma.drillHole.findMany({
      where: { holeId: { in: ids } },
      select: { id: true, holeId: true },
    });
    for (const row of rows) existing.set(row.holeId.toLowerCase(), row.id);
  }
  return existing;
}

export interface ImportPlan {
  creates: ImportRow[];
  /** Rows for holes that exist, with the id of the hole each one updates. */
  updates: (ImportRow & { id: string })[];
  /** Rows for holes that exist, left alone because updating was not asked for. */
  skips: ImportRow[];
}

export function planImport(rows: ImportRow[], existing: Map<string, string>, updateExisting: boolean): ImportPlan {
  const plan: ImportPlan = { creates: [], updates: [], skips: [] };
  for (const row of rows) {
    const id = existing.get(row.data.holeId.toLowerCase());
    if (id === undefined) plan.creates.push(row);
    else if (updateExisting) plan.updates.push({ ...row, id });
    else plan.skips.push(row);
  }
  return plan;
}

function columnsOf(data: DrillHoleImportRow) {
  return {
    area: data.area ?? null,
    easting: data.easting ?? null,
    northing: data.northing ?? null,
    elevation: data.elevation ?? null,
    azimuth: data.azimuth ?? null,
    dip: data.dip ?? null,
    totalDepth: data.totalDepth ?? null,
    startDate: toDateColumn(data.startDate) ?? null,
    endDate: toDateColumn(data.endDate) ?? null,
    remarks: data.remarks ?? null,
  };
}

export interface WriteResult {
  created: number;
  updated: number;
}

/**
 * Writes the plan, reporting after every chunk.
 *
 * New holes go through createMany, which also gives them the same cuid ids
 * as holes made one at a time. `skipDuplicates` covers a hole somebody added
 * by hand between the preview and this write: it is left as it is rather than
 * failing the chunk, and the count says so.
 *
 * Existing holes are updated through a join on a derived table of the new
 * values. A blank cell arrives as NULL, and COALESCE keeps the stored value
 * for it: a sheet with only some columns filled in -- or only some columns at
 * all -- changes only what it says.
 */
export async function writeImport(
  plan: ImportPlan,
  userId: string,
  onProgress: (done: number, total: number) => void
): Promise<WriteResult> {
  const total = plan.creates.length + plan.updates.length;
  let done = 0;
  let created = 0;
  let updated = 0;

  for (const chunk of chunks(plan.creates, CREATE_CHUNK)) {
    const result = await prisma.drillHole.createMany({
      data: chunk.map(({ data }) => ({
        holeId: data.holeId,
        status: data.status ?? "PLANNED",
        ...columnsOf(data),
        createdById: userId,
      })),
      skipDuplicates: true,
    });
    created += result.count;
    done += chunk.length;
    onProgress(done, total);
  }

  const now = new Date();
  for (const chunk of chunks(plan.updates, UPDATE_CHUNK)) {
    const values = Prisma.join(
      chunk.map(({ id, data }, index) => {
        const c = columnsOf(data);
        // Column names on the first SELECT only; UNION ALL takes them from there.
        return index === 0
          ? Prisma.sql`SELECT ${id} AS id, ${c.area} AS area, ${c.easting} AS easting,
              ${c.northing} AS northing, ${c.elevation} AS elevation, ${c.azimuth} AS azimuth,
              ${c.dip} AS dip, ${c.totalDepth} AS total_depth, ${data.status ?? null} AS status,
              ${c.startDate} AS start_date, ${c.endDate} AS end_date, ${c.remarks} AS remarks`
          : Prisma.sql`SELECT ${id}, ${c.area}, ${c.easting}, ${c.northing}, ${c.elevation},
              ${c.azimuth}, ${c.dip}, ${c.totalDepth}, ${data.status ?? null}, ${c.startDate},
              ${c.endDate}, ${c.remarks}`;
      }),
      " UNION ALL "
    );
    // MySQL's affected count leaves out rows whose values did not change;
    // the rows the sheet asked for are what is reported instead.
    await prisma.$executeRaw`
      UPDATE drill_holes AS d
      JOIN (${values}) AS v ON v.id = d.id
      SET d.area = COALESCE(v.area, d.area),
          d.easting = COALESCE(v.easting, d.easting),
          d.northing = COALESCE(v.northing, d.northing),
          d.elevation = COALESCE(v.elevation, d.elevation),
          d.azimuth = COALESCE(v.azimuth, d.azimuth),
          d.dip = COALESCE(v.dip, d.dip),
          d.total_depth = COALESCE(v.total_depth, d.total_depth),
          d.status = COALESCE(v.status, d.status),
          d.start_date = COALESCE(v.start_date, d.start_date),
          d.end_date = COALESCE(v.end_date, d.end_date),
          d.remarks = COALESCE(v.remarks, d.remarks),
          d.updated_by = ${userId},
          d.updated_at = ${now}`;
    updated += chunk.length;
    done += chunk.length;
    onProgress(done, total);
  }

  return { created, updated };
}
