import { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { rolePasswordSchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { listRolePasswordStatus, setRolePassword } from "@/lib/role-password";

/** Which roles have a default password, when it was set and by whom -- never the password. */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "manageUsers");
    return jsonSuccess(await listRolePasswordStatus());
  } catch (error) {
    return handleApiError(error);
  }
}

/** Sets a role's default. Accounts already on the old one are left as they are. */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireCapability(request, "manageUsers");
    const body = rolePasswordSchema.parse(await readJsonBody(request));
    await setRolePassword(body.role, body.password, session.userId);
    return jsonSuccess(await listRolePasswordStatus());
  } catch (error) {
    return handleApiError(error);
  }
}
