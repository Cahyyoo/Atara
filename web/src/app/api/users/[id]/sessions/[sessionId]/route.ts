import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { requireManagedUser } from "@/lib/managed-user";
import { recordSignIn, SignInOutcome } from "@/lib/sign-in-audit";
import { endSessionById } from "@/lib/user-session";

/**
 * Ends one of an account's sessions. Not the administrator's own current
 * one: that is what signing out is for.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const admin = await requireCapability(request, "manageUsers");
    const { id, sessionId } = await context.params;
    await requireManagedUser(admin, id);

    if (sessionId === admin.sessionId) {
      throw new ApiError("Use sign out to end your own current session.", 400);
    }

    if (!(await endSessionById(sessionId, id, "ADMIN_ENDED"))) {
      throw new ApiError("Session not found, or it has already ended.", 404);
    }
    await recordSignIn({
      userId: id,
      outcome: SignInOutcome.SESSION_ENDED_BY_ADMIN,
      headers: request.headers,
    });

    return jsonSuccess({ ended: 1 });
  } catch (error) {
    return handleApiError(error);
  }
}
