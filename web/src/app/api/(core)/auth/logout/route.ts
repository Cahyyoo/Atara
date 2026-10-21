import type { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/core/lib/http/api-response";
import { getSessionFromRequest, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/core/lib/auth/auth";
import { endSession } from "@/core/lib/auth/user-session";
import { isCrossOriginWrite } from "@/core/lib/http/same-origin";
import { readJsonBody, BODY_LIMIT } from "@/core/lib/http/api-request";

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
 *
 * Except for one case, which is a refusal only in name: the browser may say
 * which session it means to end (`sessionId`). Every tab shares one cookie, so
 * a tab left showing "your session has ended" would otherwise sign out the
 * session another tab has just signed in with -- and that tab, a moment after
 * a sign-in that worked, landed back on /login. When the cookie now holds a
 * different session, that one is left alone and so is the cookie. The phone
 * sends no body and is unaffected.
 */
export async function POST(request: NextRequest) {
  // Signing somebody out from another origin is a nuisance worth refusing.
  if (isCrossOriginWrite(request)) {
    return jsonError("This request did not come from this site.", 403);
  }

  const session = await getSessionFromRequest(request);
  const expected = await expectedSessionId(request);

  if (session && expected && expected !== session.sessionId) {
    return jsonSuccess({ loggedOut: true, stale: true });
  }

  if (session) {
    await endSession(session.sessionId, session.userId);
  }

  const response = jsonSuccess({ loggedOut: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0, request));
  return response;
}

/** The session the caller means to end, when it says; never a reason to fail. */
async function expectedSessionId(request: NextRequest): Promise<string | null> {
  try {
    // Capped like every body here; a tiny one is all this ever carries.
    const body: unknown = await readJsonBody(request, BODY_LIMIT.login);
    if (body && typeof body === "object" && "sessionId" in body && typeof body.sessionId === "string") {
      return body.sessionId;
    }
  } catch {
    // No body, not JSON, or too large: the phone and older clients send none.
  }
  return null;
}
