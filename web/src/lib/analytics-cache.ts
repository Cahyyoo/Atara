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

/**
 * How long a viewer waits for a fresh computation before being shown the last
 * one for the same view instead, and how old that last one may be.
 *
 * The key above changes every minute, so every minute somebody's request
 * started a full computation and everyone arriving meanwhile waited on it:
 * 7.6 s on an idle database, and under load the dashboard took about two
 * minutes to fill. Now a slow recomputation still runs and lands in the cache,
 * but nobody waits more than a moment for it while a recent answer exists.
 */
export const STALE_WAIT_MS = 1_500;
export const STALE_MAX_MS = 5 * 60_000;

const lastByView = new Map<string, { value: AnalyticsResult; at: number }>();

/**
 * The same view a minute later: same span, same filters, and "live" when the
 * window ends now (the default dashboard) or its fixed end otherwise.
 */
export function analyticsViewKey(from: Date, to: Date, filter: AnalyticsFilter = {}, now: number = Date.now()): string {
  const live = Math.abs(now - to.getTime()) < 2 * 60_000;
  const span = Math.round((to.getTime() - from.getTime()) / 60_000);
  return `${span}|${live ? "live" : to.toISOString()}|${analyticsKey(from, to, filter).split("|")[2]}`;
}

export function cachedAnalytics(
  from: Date,
  to: Date,
  filter: AnalyticsFilter = {},
  now: number = Date.now(),
  /** False when the numbers are kept, as in the downloaded report. */
  { allowStale = true }: { allowStale?: boolean } = {}
): Promise<AnalyticsResult> {
  const view = analyticsViewKey(from, to, filter, now);
  const fresh = cache.get(analyticsKey(from, to, filter), () => buildAnalytics(from, to, filter), now).then((value) => {
    lastByView.delete(view);
    lastByView.set(view, { value, at: Date.now() });
    while (lastByView.size > 64) lastByView.delete(lastByView.keys().next().value!);
    return value;
  });

  const previous = lastByView.get(view);
  if (!allowStale || !previous || now - previous.at > STALE_MAX_MS) return fresh;

  // Whoever is still waiting when the fresh one lands gets it; nobody waits
  // longer than STALE_WAIT_MS while a recent answer exists.
  fresh.catch(() => {});
  return Promise.race([
    fresh,
    new Promise<AnalyticsResult>((resolve) => setTimeout(() => resolve(previous.value), STALE_WAIT_MS)),
  ]);
}

/**
 * After a change whose author is looking at the dashboard for its effect.
 *
 * The next view recomputes; if that takes longer than STALE_WAIT_MS, the
 * previous numbers are shown once more while it finishes. Without that, an
 * analyst saving results every few seconds sent every dashboard viewer back
 * to a full wait each time.
 */
export function invalidateAnalytics(): void {
  cache.invalidate();
}

/** Test seam. */
export function analyticsCacheSize(): number {
  return cache.size;
}
