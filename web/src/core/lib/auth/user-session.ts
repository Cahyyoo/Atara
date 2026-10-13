import "server-only";

import { Prisma, type SessionEndReason } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { clientAddressFromHeaders } from "@/core/lib/http/rate-limit";
import { recordSignIn, SignInOutcome } from "@/core/lib/auth/sign-in-audit";
import { clientFrom, deviceInfoFrom, summarizeDevice } from "@/core/lib/auth/session-client";

/** Tries at opening a session when the database picks it as a deadlock victim. */
const SESSION_START_ATTEMPTS = 6;

/**
 * Opens a session for a sign-in that has just succeeded, ending whatever held
 * the same slot.
 *
 * The latest sign-in wins, without asking: the device it replaces is told
 * promptly (SessionWatch on the web, the heartbeat on the phone) what took
 * its place and when.
 *
 * One transaction, so there is never a moment with two live sessions in a
 * slot, nor one with none after the new token is out. The account's trail
 * records the takeover (SESSION_REPLACED), because "somebody signed in on
 * another laptop and my screen went to the login page" is exactly the event
 * an administrator gets asked about.
 */
export async function startSession(userId: string, headers: Headers) {
  const client = clientFrom(headers);
  const info = deviceInfoFrom(headers, client);
  const address = clientAddressFromHeaders(headers);

  const open = () =>
    prisma.$transaction(
      async (tx) => {
        const session = await tx.userSession.create({
          data: {
            userId,
            client,
            device: summarizeDevice(info),
            deviceInfo: info ? (info as unknown as Prisma.InputJsonObject) : Prisma.DbNull,
            address,
          },
          select: { id: true },
        });
        const replaced = await tx.userSession.updateMany({
          where: { userId, client, endedAt: null, id: { not: session.id } },
          data: { endedAt: new Date(), endedReason: "REPLACED", replacedById: session.id },
        });
        return { session, replaced: replaced.count };
      },
      // Read committed, so the update takes no gap locks. Under MySQL's
      // default (repeatable read) the range it scans on (user, client,
      // ended_at) was gap-locked, and sign-ins of *different* accounts whose
      // ids sit next to each other in that index deadlocked: at a shift
      // change, most of a crew got a 500 instead of a session. A row the other
      // sign-in has inserted but not committed is still waited for, so the
      // slot never ends up with two live sessions.
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );

  // The same account signing in twice at once can still deadlock on the two
  // new rows; the database picks one as the victim, and it is simply run again.
  let result: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 1; !result; attempt++) {
    try {
      result = await open();
    } catch (error) {
      const deadlock = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!deadlock || attempt >= SESSION_START_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80 * attempt));
    }
  }
  const { session, replaced } = result;

  if (replaced > 0) {
    await recordSignIn({ userId, outcome: SignInOutcome.SESSION_REPLACED, headers });
  }

  return session.id;
}

/** Signing out: this session ends here, and its slot is free. */
export async function endSession(sessionId: string, userId: string) {
  await prisma.userSession.updateMany({
    where: { id: sessionId, userId, endedAt: null },
    data: { endedAt: new Date(), endedReason: "LOGOUT" },
  });
}

/** The endings somebody other than the device itself decides. */
export type ForcedEndReason = Extract<SessionEndReason, "ADMIN_ENDED" | "PASSWORD_CHANGED">;

/**
 * Ends every live session of an account, except the one asking when it is
 * the account's own (a password change keeps the device it was made on).
 * Returns how many ended. The devices find out at their next request or
 * heartbeat, and are told why.
 */
export async function endUserSessions(
  userId: string,
  reason: ForcedEndReason,
  { exceptSessionId }: { exceptSessionId?: string } = {}
) {
  const ended = await prisma.userSession.updateMany({
    where: {
      userId,
      endedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { endedAt: new Date(), endedReason: reason },
  });
  return ended.count;
}

/** Ends one session of an account. False when it had already ended. */
export async function endSessionById(sessionId: string, userId: string, reason: ForcedEndReason) {
  const ended = await prisma.userSession.updateMany({
    where: { id: sessionId, userId, endedAt: null },
    data: { endedAt: new Date(), endedReason: reason },
  });
  return ended.count > 0;
}
