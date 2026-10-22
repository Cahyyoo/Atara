import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { chunks } from "@/core/lib/batch";
import { toDateColumn } from "@/modules/eksplorasi/lib/data-source";
import { DATA_SOURCE_FIELDS, type DataSourceField } from "@/modules/eksplorasi/lib/data-source-columns";
import type { DataSourceImportRow, ImportRow } from "@/modules/eksplorasi/lib/data-source-import";

/**
 * Writing an imported sheet: tens of thousands of rows in a few dozen
 * statements rather than one statement per row.
 *
 * Each chunk commits on its own. One transaction around 34,000 rows would
 * hold its locks for the whole write and hit the 30-second ceiling every
 * other write here uses; chunks keep each lock short, and the import is safe
 * to run again from the top if it stops halfway -- a row that made it in is
 * matched by its sample ID the second time and updated, not duplicated.
 */

/** Rows per createMany. One INSERT each, well under MySQL's packet size. */
const CREATE_CHUNK = 1_000;
/** Rows per UPDATE ... JOIN: 29 placeholders each, far below the 65,535 cap. */
const UPDATE_CHUNK = 500;
/** Sample IDs per lookup. */
const LOOKUP_CHUNK = 1_000;

/** Every column an import may change: all but the sample ID it is matched by. */
const UPDATED_FIELDS = DATA_SOURCE_FIELDS.filter((field) => field !== "sampleId");
type UpdatedField = Exclude<DataSourceField, "sampleId">;

/** The fields whose column has another name (@map in eksplorasi.prisma); the rest share the field's. */
const MAPPED: Partial<Record<UpdatedField, string>> = {
  controlDate: "control_date",
  holeId: "hole_id",
  sampleType: "sample_type",
};

/** Each field's column, quoted: `from` and `to` are reserved words. Constants, never request data. */
const COLUMN = Object.fromEntries(
  UPDATED_FIELDS.map((field) => [field, Prisma.raw(`\`${MAPPED[field] ?? field}\``)])
) as Record<UpdatedField, Prisma.Sql>;

/** The rows that already exist, by lower-cased sample ID -- how the unique index compares them. */
export async function findExistingSamples(sampleIds: string[]): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  for (const ids of chunks(sampleIds, LOOKUP_CHUNK)) {
    const rows = await prisma.dataSource.findMany({
      where: { sampleId: { in: ids } },
      select: { id: true, sampleId: true },
    });
    for (const row of rows) existing.set(row.sampleId.toLowerCase(), row.id);
  }
  return existing;
}

export interface ImportPlan {
  creates: ImportRow[];
  /** Rows for samples that exist, with the id of the row each one updates. */
  updates: (ImportRow & { id: string })[];
  /** Rows for samples that exist, left alone because updating was not asked for. */
  skips: ImportRow[];
}

export function planImport(rows: ImportRow[], existing: Map<string, string>, updateExisting: boolean): ImportPlan {
  const plan: ImportPlan = { creates: [], updates: [], skips: [] };
  for (const row of rows) {
    const id = existing.get(row.data.sampleId.toLowerCase());
    if (id === undefined) plan.creates.push(row);
    else if (updateExisting) plan.updates.push({ ...row, id });
    else plan.skips.push(row);
  }
  return plan;
}

/** A row's values as the columns take them; a column the sheet left out, or left blank, is null. */
function valuesOf(data: DataSourceImportRow): Record<UpdatedField, string | Date | null> {
  return Object.fromEntries(
    UPDATED_FIELDS.map((field) => [field, field === "date" ? (toDateColumn(data.date) ?? null) : (data[field] ?? null)])
  ) as Record<UpdatedField, string | Date | null>;
}

export interface WriteResult {
  created: number;
  updated: number;
}

/**
 * Writes the plan, reporting after every chunk.
 *
 * New rows go through createMany, which also gives them the same cuid ids as
 * rows made one at a time. `skipDuplicates` covers a sample somebody added by
 * hand between the preview and this write: it is left as it is rather than
 * failing the chunk, and the count says so.
 *
 * Existing rows are updated through a join on a derived table of the new
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
    const result = await prisma.dataSource.createMany({
      data: chunk.map(({ data }) => ({
        ...(valuesOf(data) as Omit<Prisma.DataSourceCreateManyInput, "sampleId" | "sampleType" | "createdById">),
        sampleId: data.sampleId,
        sampleType: data.sampleType,
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
      chunk.map(({ id, data }) => {
        const v = valuesOf(data);
        return Prisma.sql`SELECT ${id} AS id, ${Prisma.join(
          UPDATED_FIELDS.map((field) => Prisma.sql`${v[field]} AS ${COLUMN[field]}`),
          ", "
        )}`;
      }),
      " UNION ALL "
    );
    const assignments = Prisma.join(
      UPDATED_FIELDS.map((field) => Prisma.sql`d.${COLUMN[field]} = COALESCE(v.${COLUMN[field]}, d.${COLUMN[field]})`),
      ", "
    );
    // MySQL's affected count leaves out rows whose values did not change;
    // the rows the sheet asked for are what is reported instead.
    await prisma.$executeRaw`
      UPDATE eksplorasi_data_source AS d
      JOIN (${values}) AS v ON v.id = d.id
      SET ${assignments},
          d.updated_by = ${userId},
          d.updated_at = ${now}`;
    updated += chunk.length;
    done += chunk.length;
    onProgress(done, total);
  }

  return { created, updated };
}
