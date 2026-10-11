import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";
import { loadActiveAnnouncements } from "@/lib/announcements";

/**
 * The banner as this account should see it now: live announcements aimed at
 * their role, warnings first.
 *
 * Separate from the administrator's list next door, which is every
 * announcement ever written and is theirs to manage. This one is for reading,
 * so every signed-in account may call it -- the website renders the same thing
 * in its layout, and the phone has no layout to render it from.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession(request);
    return jsonSuccess({ announcements: await loadActiveAnnouncements(session.role) });
  } catch (error) {
    return handleApiError(error);
  }
}
