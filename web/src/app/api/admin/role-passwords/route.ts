import { NextRequest } from "next/server";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { rolePasswordSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { listRolePasswordStatus, setRolePassword } from "@/lib/role-password";
import { assignableRoles } from "@/lib/user-scope";

/**
 * Which roles have a default password, when it was set and by whom -- never
 * the password. Only the roles this manager hands out (user-scope.ts): the
 * super admin keeps the admins' default, the lab admin its staff's.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireCapability(request, "manageUsers");
    return jsonSuccess(await listRolePasswordStatus(assignableRoles(session)));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Sets a role's default. Accounts already on the old one are left as they are. */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireCapability(request, "manageUsers");
    const body = rolePasswordSchema.parse(await readJsonBody(request));
    const roles = assignableRoles(session);
    if (!roles.includes(body.role)) {
      throw new ApiError("You cannot set the default password of that role.", 403);
    }
    await setRolePassword(body.role, body.password, session.userId);
    return jsonSuccess(await listRolePasswordStatus(roles));
  } catch (error) {
    return handleApiError(error);
  }
}
