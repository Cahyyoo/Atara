/**
 * A small in-process cache with a lifetime, and one property that matters
 * more than the lifetime: **single flight**.
 *
 * At shift change, fifty preparators land on the dashboard within the same
 * second. Without single flight each of them would find the cache empty and
 * start the same fourteen aggregate statements, and the pool -- nine or
 * twenty-five connections, it does not matter which -- would be gone before
 * the first answer came back. With it, the first caller computes and the
 * other forty-nine wait on that one promise.
 *
 * In-process and not Next's `unstable_cache` on purpose: every page here is
 * `force-dynamic`, which governs Next's render and fetch caches and not module
 * state, and `unstable_cache` serialises to the filesystem on every hit and
 * offers no single flight. A `Map` that dies with the process is exactly the
 * right lifetime for data that is stale in thirty seconds anyway.
 *
 * Failures are not cached: a computation that threw leaves nothing behind, so
 * the next caller tries again rather than being handed the error for the rest
 * of the TTL.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    /** Oldest entries go first once this is passed. */
    private readonly maxEntries = 64
  ) {}

  /** The cached value, the in-flight computation, or a fresh one -- in that order. */
  get(key: string, compute: () => Promise<T>, now: number = Date.now()): Promise<T> {
    const held = this.entries.get(key);
    if (held && held.expiresAt > now) {
      return Promise.resolve(held.value);
    }

    const running = this.inFlight.get(key);
    if (running) {
      return running;
    }

    // The lifetime runs from when the value was computed, not from when it was
    // asked for. Counted from the ask, anything slower than the TTL was stored
    // already expired: under load the slowest computations -- the very ones
    // this cache is for (a 50-second activity summary, a dashboard past 30 s)
    // -- were never cached at all, and every caller recomputed them.
    const startedAt = Date.now();
    const started = compute().then(
      (value) => {
        this.entries.delete(key);
        this.entries.set(key, { value, expiresAt: now + (Date.now() - startedAt) + this.ttlMs });
        this.prune();
        return value;
      },
      (error) => {
        // Nothing stored: see the header.
        throw error;
      }
    );
    // Removed in a separate step so a synchronous throw inside `then` above
    // can never leave a stale in-flight entry behind.
    const tracked = started.finally(() => {
      if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
    });
    this.inFlight.set(key, tracked);
    return tracked;
  }

  /** Forget one key, or everything. The next `get` computes again. */
  invalidate(key?: string): void {
    if (key === undefined) {
      this.entries.clear();
      return;
    }
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  private prune(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}
