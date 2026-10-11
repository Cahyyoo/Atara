import type { UserRole } from "@prisma/client";
import { jsonSuccess } from "@/lib/api-response";
import {
  signSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth";
import { startSession } from "@/lib/user-session";
import { prisma } from "@/lib/prisma";

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
  headers: Headers,
  extra: Record<string, unknown> = {}
) {
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

  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(SESSION_COOKIE_MAX_AGE));

  return response;
}
