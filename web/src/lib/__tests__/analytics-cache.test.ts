import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const build = vi.fn();
vi.mock("@/lib/analytics", () => ({ buildAnalytics: (...args: unknown[]) => build(...args) }));

const { cachedAnalytics, invalidateAnalytics, STALE_WAIT_MS } = await import("@/lib/analytics-cache");

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 9, 2, 0, 0);
const range = (now: number) => ({ from: new Date(now - 14 * 24 * 60 * MINUTE), to: new Date(now) });

/** A computation that finishes only when the test says so. */
function slow(value: unknown) {
  let finish!: () => void;
  const promise = new Promise((resolve) => {
    finish = () => resolve(value);
  });
  return { promise, finish };
}

describe("cachedAnalytics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    build.mockReset();
    invalidateAnalytics();
  });
  afterEach(() => vi.useRealTimers());

  it("shows the last minute's numbers while a slow recomputation runs", async () => {
    build.mockResolvedValueOnce({ total: 1 });
    const first = range(T0);
    expect(await cachedAnalytics(first.from, first.to, {}, T0)).toEqual({ total: 1 });

    // A minute on: new key, and the database is slow.
    const later = T0 + MINUTE;
    vi.setSystemTime(later);
    const recompute = slow({ total: 2 });
    build.mockReturnValueOnce(recompute.promise);
    const next = range(later);
    const answer = cachedAnalytics(next.from, next.to, {}, later);
    await vi.advanceTimersByTimeAsync(STALE_WAIT_MS);
    expect(await answer).toEqual({ total: 1 });

    // The recomputation still lands, and the next viewer gets it at once.
    recompute.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(await cachedAnalytics(next.from, next.to, {}, later)).toEqual({ total: 2 });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("returns the fresh numbers when they come quickly", async () => {
    build.mockResolvedValueOnce({ total: 1 }).mockResolvedValueOnce({ total: 2 });
    const first = range(T0);
    await cachedAnalytics(first.from, first.to, {}, T0);
    const later = T0 + MINUTE;
    const next = range(later);
    expect(await cachedAnalytics(next.from, next.to, {}, later)).toEqual({ total: 2 });
  });

  it("waits for fresh numbers when stale ones are not allowed", async () => {
    build.mockResolvedValueOnce({ total: 1 });
    const first = range(T0);
    await cachedAnalytics(first.from, first.to, {}, T0);

    const later = T0 + MINUTE;
    const recompute = slow({ total: 2 });
    build.mockReturnValueOnce(recompute.promise);
    const next = range(later);
    let settled: unknown = null;
    const answer = cachedAnalytics(next.from, next.to, {}, later, { allowStale: false }).then((value) => (settled = value));
    await vi.advanceTimersByTimeAsync(STALE_WAIT_MS * 3);
    expect(settled).toBeNull();
    recompute.finish();
    await answer;
    expect(settled).toEqual({ total: 2 });
  });

  it("does not offer numbers for a different filter", async () => {
    build.mockResolvedValueOnce({ total: 1 });
    const first = range(T0);
    await cachedAnalytics(first.from, first.to, { placeId: "MOL" }, T0);

    const recompute = slow({ total: 9 });
    build.mockReturnValueOnce(recompute.promise);
    let settled: unknown = null;
    const answer = cachedAnalytics(first.from, first.to, { placeId: "LAM" }, T0).then((value) => (settled = value));
    await vi.advanceTimersByTimeAsync(STALE_WAIT_MS * 3);
    expect(settled).toBeNull();
    recompute.finish();
    await answer;
    expect(settled).toEqual({ total: 9 });
  });
});
