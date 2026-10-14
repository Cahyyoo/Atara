import "server-only";

import { TtlCache } from "@/core/lib/ttl-cache";
import { witaWallClock } from "@/core/lib/wita-time";
import { buildGradeControl } from "@/modules/lab/lib/analytics/grade-control";
import { NO_CODE } from "@/modules/lab/lib/analytics/grade-groups";
import type { YtdProduction, YtdRow } from "@/modules/lab/lib/analytics/ytd-types";

/** A year's aggregate moves slowly; the wall monitor asks every minute. */
const YTD_TTL_MS = 5 * 60_000;
const ytdCache = new TtlCache<YtdProduction>(YTD_TTL_MS, 4);

/** The year on the lab's clock: WITA, eight hours ahead of UTC. */
function witaYear(now: Date): number {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

/**
 * The year so far, per place and per production code: production samples
 * (no non-production code) and each non-production code (TP, BG, ...) on its
 * own, with how many were taken, how many have a Ni result, and their average
 * Ni and Fe.
 *
 * The grade-control aggregate, over 1 January (WITA) to now: the same samples,
 * filters and averages the Conclusion page shows, without the 90-day window
 * the dashboard's ranges are held to.
 */
export async function loadYtdProduction(now: Date = new Date()): Promise<YtdProduction> {
  const year = witaYear(now);
  return ytdCache.get(String(year), async () => {
    const from = witaWallClock(year, 1, 1)!;
    const grades = await buildGradeControl(from, now, ["place", "nonProd"]);
    const rows: YtdRow[] = grades.rows.map((row) => ({
      place: row.codes.place === NO_CODE ? null : (row.codes.place ?? null),
      code: row.codes.nonProd === NO_CODE ? null : (row.codes.nonProd ?? null),
      samples: row.samples,
      assayed: row.assayed,
      ni: row.avg.ni,
      fe: row.avg.fe,
    }));
    // By place, a sample with none last; production first in each, then the codes.
    const order = (value: string | null) => value ?? "￿";
    rows.sort(
      (a, b) =>
        order(a.place).localeCompare(order(b.place)) ||
        Number(a.code !== null) - Number(b.code !== null) ||
        order(a.code).localeCompare(order(b.code))
    );
    return { year, generatedAt: now.toISOString(), rows };
  });
}
