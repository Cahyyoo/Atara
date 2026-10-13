import type { Stage } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { TtlCache } from "@/core/lib/ttl-cache";

/**
 * The five stages, read once per half minute instead of once per scan.
 *
 * The table is static -- an admin edits a description or an SLA a few times a
 * year -- and it was being read in full on every scan, every "my work"
 * refresh, every dashboard render and every analytics call. None of those
 * reads was expensive on its own; all of them together were one pool checkout
 * per request that bought nothing.
 *
 * Thirty seconds matches the `Cache-Control: max-age=30` the /api/stages route
 * already promises browsers, so the server is never staler than the client
 * was allowed to be. Edits invalidate on top of that.
 */

export const STAGES_TTL_MS = 30_000;

const cache = new TtlCache<Stage[]>(STAGES_TTL_MS, 1);
const KEY = "stages";

/** Every stage, in workflow order, as full rows: callers pick what they need. */
export function loadStages(now: number = Date.now()): Promise<Stage[]> {
  return cache.get(KEY, () => prisma.stage.findMany({ orderBy: { sequenceOrder: "asc" } }), now);
}

export function invalidateStages(): void {
  cache.invalidate(KEY);
}
