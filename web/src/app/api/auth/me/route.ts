import { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    // requireSession rather than a bare token decode, so a deactivated account
    // stops reporting itself as signed in.
    const session = await requireSession(request, { allowPasswordChange: true });
    return jsonSuccess({ user: session });
  } catch (error) {
    return handleApiError(error);
  }
}
