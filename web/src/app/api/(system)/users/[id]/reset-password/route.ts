import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { requireManagedUser } from "@/modules/system/lib/managed-user";
import { USER_SELECT } from "@/modules/system/lib/user";
import { roleDefaultHash } from "@/modules/system/lib/role-password";
import { endUserSessions } from "@/core/lib/auth/user-session";
import { recordSignIn, SignInOutcome } from "@/core/lib/auth/sign-in-audit";

/**
 * A forgotten password: put the account back on its role's default, which
 * its owner then has to replace on their next sign-in. A lockout is cleared
 * with it, and every device still signed in is signed out -- the default is
 * a password other people know.
 *
 * Not for an administrator's own account: they change theirs like anybody,
 * with the current one.
 */
export const POST = route<{ id: string }>({ capability: "manageUsers" }, async ({ request, session, params }) => {
  const { id } = params;

  if (id === session.userId) {
    throw new ApiError("Change your own password from your account menu instead.", 400);
  }

  const target = await requireManagedUser(session, id);

  const user = await prisma.user.update({
    where: { id },
    data: {
      password: await roleDefaultHash(target.role),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    select: USER_SELECT,
  });

  const ended = await endUserSessions(id, "ADMIN_ENDED");
  if (ended > 0) {
    await recordSignIn({
      userId: id,
      outcome: SignInOutcome.SESSION_ENDED_BY_ADMIN,
      headers: request.headers,
    });
  }

  return jsonSuccess(user);
});
