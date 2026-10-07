import { buildAnalytics, type AnalyticsFilter, type AnalyticsResult } from "@/lib/analytics";
import { TtlCache } from "@/lib/ttl-cache";

/**
 * The dashboard's numbers, computed at most once per half minute per window.
 *
 * Every session lands on the dashboard after signing in -- the root page sends
 * it there -- and every landing used to run the full set of fourteen aggregate
 * statements, eleven of them in parallel, against a pool that holds fewer
 * connections than that. At shift change that is a thousand renders in ten
 * minutes, ~150 CPU-seconds of MySQL, and a pool that is empty before the
 * first answer returns. Now it is at most twenty computations in those ten
 * minutes, and the other 980 renders read a result that is under thirty
 * seconds old.
 *
 * What that costs: after a scan, the dashboard can be up to thirty seconds
 * behind. That is a dashboard. Admin actions whose author expects to see the
 * effect at once -- generating or deleting samples, editing results --
 * invalidate explicitly; scans do not, because they arrive dozens a minute
 * and would defeat the cache entirely.
 *
 * Shared by the page's server render and by /api/analytics, so the two never
 * compute the same window twice.
 */

export const ANALYTICS_TTL_MS = 30_000;

const cache = new TtlCache<AnalyticsResult>(ANALYTICS_TTL_MS, 64);

/**
 * `to` is rounded to the minute, and `from` is whatever the range resolver
 * produced -- which is itself minute-aligned (see analytics-range.ts), so two
 * requests in the same minute share a key. Filters are sorted so that the
 * order the query string listed them in does not split the cache.
 */
export function analyticsKey(from: Date, to: Date, filter: AnalyticsFilter = {}): string {
  const active = Object.entries(filter)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return `${from.toISOString()}|${Math.floor(to.getTime() / 60_000)}|${active}`;
}

export function cachedAnalytics(
  from: Date,
  to: Date,
  filter: AnalyticsFilter = {},
  now: number = Date.now()
): Promise<AnalyticsResult> {
  return cache.get(analyticsKey(from, to, filter), () => buildAnalytics(from, to, filter), now);
}

/** After a change whose author is looking at the dashboard for its effect. */
export function invalidateAnalytics(): void {
  cache.invalidate();
}

/** Test seam. */
export function analyticsCacheSize(): number {
  return cache.size;
}
