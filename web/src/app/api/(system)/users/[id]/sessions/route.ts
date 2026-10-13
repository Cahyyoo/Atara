import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { requireManagedUser } from "@/modules/system/lib/managed-user";
import { recordSignIn, SignInOutcome } from "@/core/lib/auth/sign-in-audit";
import { endUserSessions } from "@/core/lib/auth/user-session";
import { listUserSessions } from "@/modules/system/lib/user-sessions-admin";

/** Where an account is signed in, and where it was lately. */
export const GET = route<{ id: string }>({ capability: "manageUsers" }, async ({ session: admin, params }) => {
  const { id } = params;
  await requireManagedUser(admin, id);

  return jsonSuccess(await listUserSessions(id, admin.sessionId));
});

/**
 * Signs an account out everywhere: a lost phone, a shared laptop, somebody
 * leaving. Each device is told an administrator ended it. An administrator
 * doing this to their own account keeps the session they did it from.
 */
export const DELETE = route<{ id: string }>({ capability: "manageUsers" }, async ({ request, session: admin, params }) => {
  const { id } = params;
  await requireManagedUser(admin, id);

  const ended = await endUserSessions(id, "ADMIN_ENDED", {
    exceptSessionId: id === admin.userId ? admin.sessionId : undefined,
  });
  if (ended > 0) {
    await recordSignIn({
      userId: id,
      outcome: SignInOutcome.SESSION_ENDED_BY_ADMIN,
      headers: request.headers,
    });
  }

  return jsonSuccess({ ended });
});
