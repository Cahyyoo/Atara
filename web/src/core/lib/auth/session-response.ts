import type { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { jsonSuccess } from "@/core/lib/http/api-response";
import {
  signSessionToken,
  sessionCookieOptions,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/core/lib/auth/auth";
import { endSession, startSession } from "@/core/lib/auth/user-session";
import { prisma } from "@/core/lib/prisma";

/**
 * The end of every successful sign-in: a session token in the body for the
 * mobile app, and the same token as a cookie for the browser.
 *
 * One place, because there are now three routes that finish a sign-in and
 * the cookie flags are exactly the kind of detail that drifts when copied.
 * It is also the one place a session starts, so it is where the previous
 * device in the same slot is signed out (see startSession).
 */
export async function issueSessionResponse(
  user: { id: string; name: string; email: string; role: UserRole },
  request: NextRequest,
  extra: Record<string, unknown> = {}
) {
  const headers = request.headers;

  /**
   * The browser's previous session, when it belonged to somebody else.
   *
   * Its cookie is about to be overwritten, so nothing on this browser could
   * ever end it again: it used to stay live for the rest of its seven days,
   * listed as active and good to anybody holding a copy of the token. The
   * same account needs nothing here -- startSession replaces it in the slot.
   */
  const previousToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const previous = previousToken ? await verifySessionToken(previousToken) : null;
  if (previous && previous.userId !== user.id) {
    await endSession(previous.sessionId, previous.userId);
  }

  const sessionId = await startSession(user.id, headers);

  // Read here rather than asked of every caller: the department, which the
  // token carries beside the role, and whether the password an administrator
  // chose has to be replaced first, so the browser can go straight there.
  // The phone ignores the latter for now.
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true, department: true },
  });
  const department = account?.department ?? null;

  const token = await signSessionToken({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department,
    sessionId,
  });

  const response = jsonSuccess({
    ...extra,
    mustChangePassword: account?.mustChangePassword ?? false,
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, department },
  });

  // A body carrying a session token is never kept by a cache along the way.
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_COOKIE_MAX_AGE, request));

  return response;
}
