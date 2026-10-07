import { Prisma } from "@prisma/client";
import type { SubFilter } from "@/lib/validation";

/**
 * Which lab records a figure counts: the samples themselves ("parents", the
 * default), every record ("all"), or the sub-samples alone ("subs").
 */

/** As a Prisma filter on the lab record. */
export function subsWhere(subs: SubFilter): Prisma.LabRecordWhereInput {
  if (subs === "all") return {};
  return subs === "subs" ? { parentId: { not: null } } : { parentId: null };
}

/** As an `AND …` for a raw query's WHERE, on the lab record aliased `alias`. */
export function subsSql(subs: SubFilter, alias = "r"): Prisma.Sql {
  const column = Prisma.raw(`${alias}.parent_id`);
  if (subs === "all") return Prisma.empty;
  return subs === "subs" ? Prisma.sql`AND ${column} IS NOT NULL` : Prisma.sql`AND ${column} IS NULL`;
}
