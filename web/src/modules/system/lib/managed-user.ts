import "server-only";
import { prisma } from "@/core/lib/prisma";
import { ApiError } from "@/core/lib/http/api-response";
import type { Access } from "@/core/lib/auth/permissions";
import { canManage } from "@/modules/system/lib/user-scope";

/**
 * The account behind `/api/users/[id]/...`, if the caller may manage it.
 *
 * An account outside the caller's scope (user-scope.ts) answers exactly like
 * one that does not exist: a lab admin has no business learning which ids
 * belong to the other departments' admins.
 */
export async function requireManagedUser(access: Access, id: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, department: true },
  });
  if (!target || !canManage(access, target)) {
    throw new ApiError("User not found.", 404);
  }
  return target;
}
