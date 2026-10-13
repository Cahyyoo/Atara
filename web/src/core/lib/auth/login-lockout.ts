import { prisma } from "@/core/lib/prisma";

/**
 * The one lockout every sign-in step shares.
 *
 * A wrong password, a face that did not match and a wrong authenticator code
 * all spend from the same five attempts. If each step had its own allowance,
 * somebody holding the password could simply pick whichever second factor
 * still had guesses left.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/**
 * One more failure, counted by the database.
 *
 * This used to take the count the route had read a moment earlier, add one,
 * and write it back. Twenty guesses sent at once all read the same number and
 * all wrote the same number back, so a burst cost about one attempt instead of
 * twenty, and the five-attempt lock arrived after something like a hundred
 * guesses. An atomic increment gives every request its own number; the lock
 * is then applied only where the count the database returned says so.
 */
export async function registerFailedAttempt(user: { id: string }): Promise<void> {
  const { failedLoginAttempts } = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    // Conditional on the count, so two requests that both crossed the line
    // do not each start a lock -- the first resets the counter and the
    // second finds nothing left to lock.
    await prisma.user.updateMany({
      where: { id: user.id, failedLoginAttempts: { gte: MAX_FAILED_ATTEMPTS } },
      data: {
        // Reset the counter so a fresh allowance follows the lock.
        failedLoginAttempts: 0,
        lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
      },
    });
  }
}

/** After a success. Skips the write when there is nothing to clear. */
export async function clearFailedAttempts(user: {
  id: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}): Promise<void> {
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }
}
