import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";
import { changePasswordSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { consumeAttempt, resetAttempts } from "@/lib/rate-limit";
import { recordSignIn, SignInOutcome } from "@/lib/sign-in-audit";
import { endUserSessions } from "@/lib/user-session";
import { ROLE_DEFAULT_PASSWORD_CODE, WRONG_PASSWORD_CODE } from "@/lib/session-codes";
import { isRoleDefault } from "@/lib/role-password";

/** Guesses at the current password from a session somebody left open. */
const PASSWORD_CHANGE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

/**
 * Somebody changing their own password.
 *
 * The current password is asked for even though the session is good: an
 * unlocked laptop should not be enough to take an account over. A wrong one
 * is a 400, not a 401 -- the session is fine, and the phone treats any 401 as
 * "signed out".
 *
 * Every other device the account is signed in on is ended (PASSWORD_CHANGED),
 * since a password is usually changed because somebody else may know it. The
 * device the change was made on stays signed in.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession(request, { allowPasswordChange: true });
    const limitKey = `password:${session.userId}`;
    if (!consumeAttempt(limitKey, PASSWORD_CHANGE_LIMIT)) {
      throw new ApiError("Too many attempts. Please wait a few minutes.", 429);
    }

    const body = changePasswordSchema.parse(await readJsonBody(request));

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { password: true, role: true },
    });
    if (!user) {
      throw new ApiError("User not found.", 404);
    }
    if (!(await bcrypt.compare(body.currentPassword, user.password))) {
      throw new ApiError("Your current password is incorrect.", 400, WRONG_PASSWORD_CODE);
    }
    // The role's default is shared by everybody an administrator gave it to.
    if (await isRoleDefault(user.role, body.newPassword)) {
      throw new ApiError(
        "Choose a password of your own, not the role's default.",
        400,
        ROLE_DEFAULT_PASSWORD_CODE
      );
    }

    await prisma.user.update({
      where: { id: session.userId },
      // Their own now: an administrator's choice no longer stands in the way.
      data: { password: await bcrypt.hash(body.newPassword, 10), mustChangePassword: false },
    });
    const endedSessions = await endUserSessions(session.userId, "PASSWORD_CHANGED", {
      exceptSessionId: session.sessionId,
    });
    await recordSignIn({
      userId: session.userId,
      outcome: SignInOutcome.PASSWORD_CHANGED,
      headers: request.headers,
    });
    resetAttempts(limitKey);

    return jsonSuccess({ endedSessions });
  } catch (error) {
    return handleApiError(error);
  }
}
