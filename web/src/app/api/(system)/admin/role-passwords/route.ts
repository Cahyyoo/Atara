import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { rolePasswordSchema } from "@/modules/system/validation";
import { readJsonBody } from "@/core/lib/http/api-request";
import { listRolePasswordStatus, setRolePassword } from "@/modules/system/lib/role-password";
import { assignableRoles } from "@/modules/system/lib/user-scope";

/**
 * Which roles have a default password, when it was set and by whom -- never
 * the password. Only the roles this manager hands out (user-scope.ts): the
 * super admin keeps the admins' default, the lab admin its staff's.
 */
export const GET = route({ capability: "manageUsers" }, async ({ session }) => {
  return jsonSuccess(await listRolePasswordStatus(assignableRoles(session)));
});

/** Sets a role's default. Accounts already on the old one are left as they are. */
export const PUT = route({ capability: "manageUsers" }, async ({ request, session }) => {
  const body = rolePasswordSchema.parse(await readJsonBody(request));
  const roles = assignableRoles(session);
  if (!roles.includes(body.role)) {
    throw new ApiError("You cannot set the default password of that role.", 403);
  }
  await setRolePassword(body.role, body.password, session.userId);
  return jsonSuccess(await listRolePasswordStatus(roles));
});
