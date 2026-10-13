import { cache } from "react";
import { prisma } from "@/core/lib/prisma";
import type { Department, Role } from "@/core/lib/auth/permissions";
import { parseDeviceInfo, type DeviceInfo } from "@/core/lib/auth/session-client";
import { isSessionEndedReason, type SessionEndedReason } from "@/core/lib/auth/session-codes";

/**
 * Where a token's session stands.
 *
 * `replaced` and `ended` are kept apart from plain "no": they are the endings
 * the person holding the token did not choose, and they are owed a sentence
 * saying so -- which device took over, or that an administrator or a password
 * change ended it, and when.
 */
export type SessionState =
  | {
      status: "active";
      role: Role;
      department: Department | null;
      /**
       * The password an administrator chose has to be replaced first, on the
       * web and on the phone alike. It matters most on the phone: operators
       * are handed their role's shared default, and they are the people who
       * work from a phone all day.
       */
      mustChangePassword: boolean;
    }
  | { status: "replaced"; at: Date; device: string | null; deviceInfo: DeviceInfo | null }
  | { status: "ended"; at: Date; reason: SessionEndedReason }
  | null;

/**
 * The session behind a token, and the account behind the session, in one read.
 *
 * Re-read on every request, so a deactivation, a role change or a sign-in on
 * another device takes effect immediately rather than when the 7-day token
 * finally expires. Wrapped in React's `cache`, which memoises per request: a
 * page render that passes through the app layout, a route guard and the page
 * itself issues one SELECT instead of three.
 *
 * The userId is checked against the row, so a token cannot borrow somebody
 * else's session id.
 */
export const loadSession = cache(
  async (sessionId: string, userId: string): Promise<SessionState> => {
    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        endedAt: true,
        endedReason: true,
        replacedById: true,
        client: true,
        user: { select: { isActive: true, role: true, department: true, mustChangePassword: true } },
      },
    });

    if (!session || session.userId !== userId || !session.user.isActive) return null;

    if (session.endedAt === null) {
      return {
        status: "active",
        role: session.user.role,
        department: session.user.department,
        mustChangePassword: session.user.mustChangePassword,
      };
    }

    if (session.endedReason === "REPLACED") {
      const successor = session.replacedById
        ? await prisma.userSession.findUnique({
            where: { id: session.replacedById },
            select: { device: true, deviceInfo: true },
          })
        : null;
      return {
        status: "replaced",
        at: session.endedAt,
        device: successor?.device ?? null,
        deviceInfo: parseDeviceInfo(successor?.deviceInfo),
      };
    }

    // Also an ending the holder did not choose, so also owed a sentence.
    if (isSessionEndedReason(session.endedReason)) {
      return { status: "ended", at: session.endedAt, reason: session.endedReason };
    }

    return null;
  }
);
