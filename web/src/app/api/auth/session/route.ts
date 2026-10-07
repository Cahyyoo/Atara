import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";

/**
 * "Is this still my session?" -- asked every few seconds by the browser and
 * the phone, so a device another sign-in took over finds out promptly rather
 * than at its next click.
 *
 * As cheap as a request can be: the token check plus one primary-key read
 * (loadSession). A replaced session answers 401 with code "session-replaced"
 * and when and where it was taken over, which is what the notice shows.
 */
export async function GET(request: NextRequest) {
  try {
    await requireSession(request, { allowPasswordChange: true });
    return jsonSuccess({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
