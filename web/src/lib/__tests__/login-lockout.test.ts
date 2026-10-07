import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearFailedAttempts,
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  registerFailedAttempt,
} from "@/lib/login-lockout";
import { prisma } from "@/lib/prisma";

/**
 * The lockout counts in the database, not in the request.
 *
 * Against the real database on purpose, like spent-challenge.test.ts: the
 * property under test is that N simultaneous failures cost N attempts, and a
 * mocked client would only prove what the mock does. The old code read the
 * count, added one, and wrote it back -- so a burst of twenty guesses all
 * read the same number and the lock arrived after about a hundred instead of
 * five.
 *
 * Skips when there is no database rather than failing, and says so once.
 */

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[login-lockout] skipped: no database reachable");
}

describe.skipIf(!reachable)("counting failed attempts", () => {
  let id = "";

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        // Kept apart from anything a running app would create.
        email: `lockout-test-${process.pid}-${Math.random().toString(36).slice(2)}@test.invalid`,
        name: "Lockout Test",
        password: "not-a-real-hash",
        role: "OPERATOR",
      },
      select: { id: true },
    });
    id = user.id;
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id } });
  });

  const state = () =>
    prisma.user.findUniqueOrThrow({
      where: { id },
      select: { failedLoginAttempts: true, lockedUntil: true },
    });

  it("counts every one of a burst, not just the first", async () => {
    // Three at once. The old code would have written 1.
    await Promise.all([1, 2, 3].map(() => registerFailedAttempt({ id })));

    expect((await state()).failedLoginAttempts).toBe(3);
  });

  it("locks on the fifth, however the five arrive", async () => {
    const before = Date.now();
    await Promise.all(Array.from({ length: MAX_FAILED_ATTEMPTS }, () => registerFailedAttempt({ id })));

    const after = await state();
    expect(after.lockedUntil).not.toBeNull();
    expect(after.lockedUntil!.getTime()).toBeGreaterThanOrEqual(before + LOCK_MINUTES * 60_000 - 1000);
    // A fresh allowance follows the lock.
    expect(after.failedLoginAttempts).toBe(0);
  });

  it("locks when a burst crosses the line all at once", async () => {
    await Promise.all(Array.from({ length: 20 }, () => registerFailedAttempt({ id })));

    expect((await state()).lockedUntil).not.toBeNull();
  });

  it("clears on success", async () => {
    await registerFailedAttempt({ id });
    await registerFailedAttempt({ id });
    await clearFailedAttempts({ id, failedLoginAttempts: 2, lockedUntil: null });

    expect((await state()).failedLoginAttempts).toBe(0);
  });
});
