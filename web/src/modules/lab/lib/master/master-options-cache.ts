import type { MasterOption, Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { TtlCache } from "@/core/lib/ttl-cache";

/**
 * The master-option lists every dropdown reads, held for half a minute.
 *
 * The dashboard mounts one fetch of these, and opening its filter panel adds
 * five more -- six reads of the same small table per visit, and until now
 * each of them also counted how many lab records pointed at every option,
 * five GROUP BY passes over the biggest table for a number only the
 * Master Data screen displays. The counts are now asked for by name
 * (`withUsage`) and never cached; the plain lists live here.
 *
 * Keyed on the two filters the route accepts. Writes invalidate everything:
 * the table is tiny and an admin edit is rare, so precision would buy nothing.
 */

export const MASTER_OPTIONS_TTL_MS = 30_000;

const cache = new TtlCache<MasterOption[]>(MASTER_OPTIONS_TTL_MS, 16);

export function loadMasterOptions(
  filter: { kind?: MasterOption["kind"]; activeOnly?: boolean },
  now: number = Date.now()
): Promise<MasterOption[]> {
  const where: Prisma.MasterOptionWhereInput = {};
  if (filter.kind) where.kind = filter.kind;
  if (filter.activeOnly) where.isActive = true;

  const key = `${filter.kind ?? "*"}|${filter.activeOnly ? 1 : 0}`;
  return cache.get(
    key,
    () =>
      prisma.masterOption.findMany({
        where,
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
      }),
    now
  );
}

export function invalidateMasterOptions(): void {
  cache.invalidate();
}
