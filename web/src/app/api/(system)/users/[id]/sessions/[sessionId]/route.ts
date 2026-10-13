import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { requireManagedUser } from "@/modules/system/lib/managed-user";
import { recordSignIn, SignInOutcome } from "@/core/lib/auth/sign-in-audit";
import { endSessionById } from "@/core/lib/auth/user-session";

/**
 * Ends one of an account's sessions. Not the administrator's own current
 * one: that is what signing out is for.
 */
export const DELETE = route<{ id: string; sessionId: string }>({ capability: "manageUsers" }, async ({ request, session: admin, params }) => {
  const { id, sessionId } = params;
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
});
