import type { NextRequest } from "next/server";
import { getSessionFromRequest, type SessionPayload } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { loadSession, type SessionState } from "@/lib/session-user";
import { can, type Capability } from "@/lib/permissions";
import { PASSWORD_CHANGE_REQUIRED_CODE, SESSION_ENDED_CODE, SESSION_REPLACED_CODE } from "@/lib/session-codes";

/**
 * The refusal for a session another device took over, with what to tell the
 * person: when, and on what. Shared by every route, and by the session check
 * the browser and the phone poll, so they all say the same thing.
 */
export function sessionReplacedError(state: Extract<SessionState, { status: "replaced" }>) {
  return new ApiError(
    "This account was signed in on another device, so this session has ended.",
    401,
    SESSION_REPLACED_CODE,
    // `device` for clients built before deviceInfo existed; deviceInfo for
    // the ones that say it in the reader's language.
    { at: state.at.toISOString(), device: state.device, deviceInfo: state.deviceInfo }
  );
}

/**
 * The refusal for a session an administrator or a password change ended,
 * saying which and when.
 */
export function sessionEndedError(state: Extract<SessionState, { status: "ended" }>) {
  return new ApiError(
    state.reason === "PASSWORD_CHANGED"
      ? "This account's password was changed, so this session has ended."
      : "An administrator ended this session.",
    401,
    SESSION_ENDED_CODE,
    { at: state.at.toISOString(), reason: state.reason }
  );
}

/**
 * Verifies the caller's token and re-reads its session and account. See
 * `loadSession`.
 *
 * A web session whose password an administrator chose is refused everything
 * until it is replaced, except what replacing it takes (`allowPasswordChange`:
 * changing it, knowing who is signed in, the session check, signing out).
 */
export async function requireSession(
  request: NextRequest,
  { allowPasswordChange = false }: { allowPasswordChange?: boolean } = {}
): Promise<SessionPayload> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new ApiError("You must be signed in to perform this action.", 401);
  }

  const state = await loadSession(session.sessionId, session.userId);
  if (state?.status === "replaced") {
    throw sessionReplacedError(state);
  }
  if (state?.status === "ended") {
    throw sessionEndedError(state);
  }
  if (!state) {
    throw new ApiError("This session is no longer valid. Please sign in again.", 401);
  }
  if (state.mustChangePassword && !allowPasswordChange) {
    throw new ApiError("Change your password before continuing.", 403, PASSWORD_CHANGE_REQUIRED_CODE);
  }

  return { ...session, role: state.role, department: state.department };
}

/**
 * A signed-in caller whose role and department hold `capability` (see
 * permissions.ts).
 *
 * Both are the ones just re-read from the database, not the ones in the
 * token, so a changed role or department applies to the very next request.
 */
export async function requireCapability(
  request: NextRequest,
  capability: Capability
): Promise<SessionPayload> {
  const session = await requireSession(request);
  if (!can(session, capability)) {
    throw new ApiError("Your role does not allow this action.", 403);
  }
  return session;
}
