import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { updateUserSchema } from "@/lib/validation";
import { USER_SELECT } from "@/lib/user";
import { readJsonBody } from "@/lib/api-request";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireCapability(request, "manageUsers");
    const { id } = await params;
    const body = updateUserSchema.parse(await readJsonBody(request));

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) {
      throw new ApiError("User not found.", 404);
    }

    // An admin must not be able to lock themselves out of the system.
    if (id === session.userId) {
      if (body.isActive === false) {
        throw new ApiError("You cannot deactivate your own account.", 400);
      }
      // Any role but ADMIN, now that there is more than one other.
      if (body.role !== undefined && body.role !== "ADMIN") {
        throw new ApiError("You cannot remove your own administrator role.", 400);
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
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
