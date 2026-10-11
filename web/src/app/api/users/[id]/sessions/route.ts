import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { requireManagedUser } from "@/lib/managed-user";
import { recordSignIn, SignInOutcome } from "@/lib/sign-in-audit";
import { endUserSessions } from "@/lib/user-session";
import { listUserSessions } from "@/lib/user-sessions-admin";

/** Where an account is signed in, and where it was lately. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireCapability(request, "manageUsers");
    const { id } = await context.params;
    await requireManagedUser(admin, id);

    return jsonSuccess(await listUserSessions(id, admin.sessionId));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Signs an account out everywhere: a lost phone, a shared laptop, somebody
 * leaving. Each device is told an administrator ended it. An administrator
 * doing this to their own account keeps the session they did it from.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireCapability(request, "manageUsers");
    const { id } = await context.params;
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
  } catch (error) {
    return handleApiError(error);
  }
}
