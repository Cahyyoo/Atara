import { prisma } from "@/core/lib/prisma";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { requireManagedUser } from "@/modules/system/lib/managed-user";
import { USER_SELECT } from "@/modules/system/lib/user";

/**
 * Ask for an authenticator, or start one over.
 *
 * The admin never handles the secret. This only marks the account as waiting
 * for a setup; the person scans their own QR code at their next sign-in, on
 * their own phone, and the first code they enter is what switches it on.
 *
 * On an account that already has one, this is the reset for a lost or
 * replaced phone: the old secret is wiped here, so the old phone stops working
 * the moment this returns, and a new one is set up at the next sign-in.
 */
export const POST = route<{ id: string }>({ capability: "manageUsers" }, async ({ session: admin, params }) => {
  const { id } = params;

  await requireManagedUser(admin, id);

  const user = await prisma.user.update({
    where: { id },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      totpLastUsedStep: null,
      totpRequestedAt: new Date(),
      totpRequestedById: admin.userId,
    },
    select: USER_SELECT,
  });

  return jsonSuccess(user);
});

/**
 * Switch the authenticator off.
 *
 * Like removing a face, there is deliberately no self-service version: any
 * way around a second factor that does not go through an admin becomes its
 * weakest point.
 */
export const DELETE = route<{ id: string }>({ capability: "manageUsers" }, async ({ session: admin, params }) => {
  const { id } = params;
  await requireManagedUser(admin, id);

  const user = await prisma.user.update({
    where: { id },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      totpLastUsedStep: null,
      totpRequestedAt: null,
      totpRequestedById: null,
    },
    select: USER_SELECT,
  });

  return jsonSuccess(user);
});
