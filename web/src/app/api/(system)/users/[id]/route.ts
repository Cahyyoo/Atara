import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { updateUserSchema } from "@/modules/system/validation";
import { USER_SELECT } from "@/modules/system/lib/user";
import { readJsonBody } from "@/core/lib/http/api-request";
import { requireManagedUser } from "@/modules/system/lib/managed-user";
import { canAssign } from "@/modules/system/lib/user-scope";

export const PATCH = route<{ id: string }>({ capability: "manageUsers" }, async ({ request, session, params }) => {
  const { id } = params;
  const body = updateUserSchema.parse(await readJsonBody(request));

  // An admin must not be able to lock themselves out of the system. Their
  // own account is never in their scope anyway; this says so plainly.
  if (id === session.userId) {
    throw new ApiError("You cannot change your own account here.", 400);
  }

  const target = await requireManagedUser(session, id);

  // The account as it would be after this change has to be one this
  // manager may hand out: no promoting a lab analyst into an admin, no
  // moving an exploration admin into the lab's staff.
  const role = body.role ?? target.role;
  const department = body.department !== undefined ? body.department : target.department;
  if (!canAssign(session, role, department)) {
    throw new ApiError("You cannot give this account that role in that department.", 403);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.department !== undefined ? { department: body.department } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.unlock ? { failedLoginAttempts: 0, lockedUntil: null } : {}),
    },
    select: USER_SELECT,
  });

  return jsonSuccess(user);
});
