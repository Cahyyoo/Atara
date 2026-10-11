import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { updateUserSchema } from "@/lib/validation";
import { USER_SELECT } from "@/lib/user";
import { readJsonBody } from "@/lib/api-request";
import { requireManagedUser } from "@/lib/managed-user";
import { canAssign } from "@/lib/user-scope";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability(request, "manageUsers");
    const { id } = await params;
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
  } catch (error) {
    return handleApiError(error);
  }
}
