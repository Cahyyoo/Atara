/**
 * Fixed-window attempt counter kept in memory.
 *
 * Deliberately simple: it lives in the process, so it resets on restart and
 * does not span instances.
 *
 * What that costs is worth stating exactly, because the answer is not the one
 * the spent-challenge store had. That store promised "exactly once" and could
 * not keep it across two processes, so it moved to the database. This promises
 * something weaker on purpose, and the thing standing behind it is durable
 * already: `failedLoginAttempts` and `lockedUntil` are columns on `core_users`,
 * written by the sign-in routes, and they span every instance because the
 * database does.
 *
 * So with N processes this window becomes N times as generous -- a spray
 * across accounts gets more tries before anything notices -- while a real
 * attempt to guess one account still walks into the lockout after five. It
 * loosens; it does not stop working.
 *
 * Move it to the database or a shared cache when this app is actually run on
 * more than one process, and not before: it writes on every attempt, where the
 * challenge store writes once per sign-in.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound on a long-running server. */
function prune(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export interface AttemptOptions {
  limit?: number;
  windowMs?: number;
  /** Injectable clock, so the behaviour can be tested without waiting. */
  now?: number;
}

/** Returns false once the key has spent its allowance for the current window. */
export function consumeAttempt(key: string, options: AttemptOptions = {}): boolean {
  const { limit = 20, windowMs = 5 * 60 * 1000, now = Date.now() } = options;

  prune(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count++;
  return true;
}

/** Clears a key's allowance — called after a successful sign-in. */
export function resetAttempts(key: string): void {
  buckets.delete(key);
}

/** Test helper: forget every bucket. */
export function clearAllAttempts(): void {
  buckets.clear();
}

/**
 * The client's address, or null when there is nothing trustworthy to read.
 *
 * `x-forwarded-for` is honoured only when the deployment says a proxy sits in
 * front, because a client can set that header itself. Trusting it unconditionally
 * hands an attacker a fresh bucket per request — a new value is a new key — which
 * defeats the limiter entirely. Behind a proxy the *last* entry is the one the
 * proxy appended and the only one it can vouch for; everything before it came
 * from the caller.
 *
 * Set TRUST_PROXY=1 when, and only when, a reverse proxy in front of this app
 * appends the header itself.
 */
export function clientAddressFromHeaders(headers: Headers): string | null {
  if (process.env.TRUST_PROXY !== "1") {
    return null;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) {
      return hops[hops.length - 1];
    }
  }

  return headers.get("x-real-ip")?.trim() || null;
}

/**
 * The key a sign-in attempt is counted against.
 *
 * With a trustworthy address, attempts are counted per address — that is what
 * catches one source spraying many accounts. Without one, they are counted per
 * account instead. Falling back to a single shared bucket would be worse than no
 * limiter at all: anyone could spend its allowance and lock every user out.
 */
export function loginAttemptKey(headers: Headers, email: string): string {
  const address = clientAddressFromHeaders(headers);
  return address ? `login:ip:${address}` : `login:email:${email.trim().toLowerCase()}`;
}
