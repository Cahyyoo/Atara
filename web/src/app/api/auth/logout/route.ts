import type { NextRequest } from "next/server";
import { jsonSuccess } from "@/lib/api-response";
import { getSessionFromRequest, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { endSession } from "@/lib/user-session";

/**
 * Signing out, for the browser (cookie) and the phone (Bearer).
 *
 * The session is ended on the server, not just forgotten by the client: the
 * token would otherwise stay good for the rest of its seven days, and the slot
 * it holds would read as taken -- the next device to sign in would be asked to
 * "continue here" over a session nobody is using.
 *
 * Never refuses. A token that is already invalid, or none at all, still gets
 * its cookie cleared and a success: signing out must always work.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (session) {
    await endSession(session.sessionId, session.userId);
  }

  const response = jsonSuccess({ loggedOut: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
  return response;
}
