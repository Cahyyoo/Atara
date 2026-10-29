import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/core/lib/ttl-cache";

describe("TtlCache", () => {
  afterEach(() => vi.useRealTimers());

  it("computes once for callers that arrive together", async () => {
    const cache = new TtlCache<number>(1_000);
    const compute = vi.fn(async () => 7);
    const [a, b] = await Promise.all([cache.get("k", compute, 0), cache.get("k", compute, 0)]);
    expect([a, b]).toEqual([7, 7]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("keeps a value for its lifetime, then computes again", async () => {
    const cache = new TtlCache<number>(1_000);
    const compute = vi.fn(async () => 1);
    await cache.get("k", compute, 0);
    await cache.get("k", compute, 999);
    expect(compute).toHaveBeenCalledTimes(1);
    await cache.get("k", compute, 1_001);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("counts the lifetime from when a slow computation finished", async () => {
    // A computation slower than the TTL used to be stored already expired,
    // so the slowest queries were never cached under load.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cache = new TtlCache<number>(15_000);
    const compute = vi.fn(
      () => new Promise<number>((resolve) => setTimeout(() => resolve(42), 50_000))
    );
    const first = cache.get("k", compute, Date.now());
    await vi.advanceTimersByTimeAsync(50_000);
    expect(await first).toBe(42);

    await cache.get("k", compute, Date.now() + 10_000);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not keep a computation overtaken by invalidate, and computes afresh for the next caller", async () => {
    for (const invalidate of [(cache: TtlCache<string>) => cache.invalidate("k"), (cache: TtlCache<string>) => cache.invalidate()]) {
      const cache = new TtlCache<string>(60_000);
      let finish: (value: string) => void = () => {};
      const before = cache.get("k", () => new Promise<string>((resolve) => (finish = resolve)), 0);
      // A write lands while the read from before it is still running.
      invalidate(cache);
      const fresh = vi.fn(async () => "after");
      const after = cache.get("k", fresh, 1);
      finish("before");
      // The callers already waiting still get their answer...
      expect(await before).toBe("before");
      expect(await after).toBe("after");
      expect(fresh).toHaveBeenCalledTimes(1);
      // ...but what is kept is the one from after the write.
      expect(await cache.get("k", async () => "again", 2)).toBe("after");
    }
  });

  it("does not keep a failure", async () => {
    const cache = new TtlCache<number>(1_000);
    await expect(cache.get("k", async () => Promise.reject(new Error("db")), 0)).rejects.toThrow("db");
    expect(await cache.get("k", async () => 3, 1)).toBe(3);
  });
});
