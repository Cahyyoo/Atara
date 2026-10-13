import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.JWT_SECRET ??= "test-secret-for-spent-challenge-tests";

import { CHALLENGE_MAX_AGE_SECONDS, claimNonce, resetNonces } from "@/core/lib/face/face-challenge";
import { prisma } from "@/core/lib/prisma";

/**
 * A challenge can be spent once, and the database is what promises it.
 *
 * Against the real database on purpose. The guarantee being tested *is* the
 * primary key -- the first insert wins and the second fails on it, atomically
 * -- so a mocked client would be testing the mock. This used to be a Map in
 * one process, which could only promise "exactly once" to that process; a
 * second worker would have broken it silently, since a replay landing on the
 * other one had nothing watching for it.
 *
 * Skips when there is no database rather than failing, the way the face
 * end-to-end tests do: a test that cannot run is not a test that passed, so
 * the reason is printed once.
 */

const reachable = await prisma.spentChallenge
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[spent-challenge] skipped: no database reachable");
}

/** Kept apart from anything a running app would write. */
const nonce = (name: string) => `test-${name}-${process.pid}-${Math.random().toString(36).slice(2)}`;

describe.skipIf(!reachable)("a challenge is single use", () => {
  beforeEach(async () => {
    await resetNonces();
  });

  afterAll(async () => {
    await resetNonces();
  });

  it("is accepted once and refused after", async () => {
    const one = nonce("a");

    expect(await claimNonce(one)).toBe(true);
    expect(await claimNonce(one)).toBe(false);
    expect(await claimNonce(one)).toBe(false);
  });

  it("does not confuse one challenge with another", async () => {
    expect(await claimNonce(nonce("a"))).toBe(true);
    expect(await claimNonce(nonce("b"))).toBe(true);
  });

  it("forgets a nonce once its token could no longer be valid anyway", async () => {
    const one = nonce("expiring");
    const start = Date.now();

    expect(await claimNonce(one, start)).toBe(true);

    // Past the token's own lifetime there is nothing left to replay, so
    // holding the nonce would only grow the table forever. Without the sweep
    // the row would outlive the window and keep refusing a nonce that is no
    // longer protecting anything.
    const afterExpiry = start + CHALLENGE_MAX_AGE_SECONDS * 1000 + 1;
    expect(await claimNonce(one, afterExpiry)).toBe(true);
  });

  it("lets exactly one of two racing claims win", async () => {
    /**
     * The test the whole change exists for.
     *
     * Two requests arriving together is precisely the case a check-then-write
     * cannot handle and a primary key can: both may read nothing, only one
     * insert survives. With the old Map, two workers would each have seen an
     * empty map of their own and both let the challenge through.
     */
    const one = nonce("racing");

    const results = await Promise.all([claimNonce(one), claimNonce(one), claimNonce(one)]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("stores the nonce rather than trusting a caller to be unique", async () => {
    const one = nonce("stored");
    await claimNonce(one);

    const row = await prisma.spentChallenge.findUnique({ where: { nonce: one } });
    expect(row).not.toBeNull();
    // The expiry is what the sweep reads; a row without a future one would be
    // deleted on the very next claim.
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
