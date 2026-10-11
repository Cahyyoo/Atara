import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import type { Access } from "@/lib/permissions";
import { canManage } from "@/lib/user-scope";

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
