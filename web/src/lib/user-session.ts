import "server-only";

import { Prisma, type SessionEndReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientAddressFromHeaders } from "@/lib/rate-limit";
import { recordSignIn, SignInOutcome } from "@/lib/sign-in-audit";
import { clientFrom, deviceInfoFrom, summarizeDevice } from "@/lib/session-client";

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

  const { session, replaced } = await prisma.$transaction(async (tx) => {
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
  });

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
