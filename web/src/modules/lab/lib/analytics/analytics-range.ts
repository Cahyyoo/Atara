import { parseDayInput } from "@/core/lib/wita-time";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_WINDOW_DAYS = 14;

/**
 * Without a ceiling, `?from=1970-01-01` asks the database to aggregate every
 * row it has, on an endpoint with no rate limit.
 */
export const MAX_WINDOW_DAYS = 90;

/** The window every analytics figure is scoped to. Shared by the page and the API. */
export function resolveAnalyticsRange(
  fromInput?: string,
  toInput?: string
): { from: Date; to: Date } {
  // Rounded down to the minute. The default window is "the last fourteen days
  // ending now", and two visits a second apart produced two different `now`s,
  // two different `from`s, and therefore two different cache keys for what is
  // the same question. A minute's granularity is invisible on a dashboard and
  // is what lets a thousand shift-change visits share one computation.
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const to = toInput ? parseDayInput(toInput) : null;
  const from = fromInput ? parseDayInput(fromInput) : null;

  // The window ends now, and starts DEFAULT_WINDOW_DAYS back unless asked otherwise.
  const rangeTo = to ? new Date(to.getTime() + DAY_MS) : now;
  const requestedFrom = from ?? new Date(rangeTo.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  const earliest = new Date(rangeTo.getTime() - MAX_WINDOW_DAYS * DAY_MS);

  return { from: requestedFrom < earliest ? earliest : requestedFrom, to: rangeTo };
}
