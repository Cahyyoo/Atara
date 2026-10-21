import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { assertJwtSecret } from "@/core/lib/env-guard";
import { isSecureRequest } from "@/core/lib/https";
import { isDepartment, isRole, type Department, type Role } from "@/core/lib/auth/permissions";

export const SESSION_COOKIE_NAME = "atara_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * The secret never changes at runtime, so it is encoded once and reused.
 *
 * Checked here as well as at boot: a placeholder or a short secret is refused
 * at the first sign or verify, so no path through this process can mint a
 * token with a key that anybody could guess. See env-guard.ts for why.
 */
let secretKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (!secretKey) {
    secretKey = new TextEncoder().encode(assertJwtSecret(process.env.JWT_SECRET));
  }
  return secretKey;
}

/**
 * Pinned rather than inherited. jose only offers HMAC for a symmetric key and
 * never accepts `none`, so this changes nothing today -- it exists so the
 * accepted algorithm is a line somebody can read instead of a property of a
 * library version.
 */
const VERIFY_OPTIONS = { algorithms: ["HS256"] };

export interface SessionPayload {
  userId: string;
  name: string;
  email: string;
  role: Role;
  /**
   * The module the account works in; null for the super admin. Re-read from
   * the database with the role (loadSession), so a token signed before the
   * account had one is corrected on its first request.
   */
  department: Department | null;
  /**
   * The UserSession row this token belongs to, carried as the `sid` claim.
   * The token is only good while that row has not ended -- see
   * loadSession in session-user.ts.
   */
  sessionId: string;
  /**
   * Which app is asking: the website or the mobile app. Read from the session
   * row on every request (requireSession), never from the token or a header,
   * so it cannot be claimed; absent on a payload that has not been through
   * that check, which reads as the website.
   */
  client?: "WEB" | "MOBILE";
}

/**
 * What a token is allowed to do.
 *
 * Every token this app signs uses the same secret, so a signature alone says
 * nothing about which door a token opens. Without this claim, the short-lived
 * token issued between the password step and the face step could simply be
 * pasted into the session cookie -- the second factor would be decorative and
 * nothing would report it.
 *
 * Checked positively on both sides: a token with no purpose, or the wrong one,
 * is refused rather than assumed.
 */
export const TOKEN_PURPOSE = {
  session: "session",
  faceChallenge: "face-challenge",
} as const;

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const { sessionId, ...claims } = payload;
  return new SignJWT({ ...claims, sid: sessionId, purpose: TOKEN_PURPOSE.session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), VERIFY_OPTIONS);
    if (
      // The load-bearing line. Everything below it only describes the shape,
      // and a face-challenge token could be given that shape by accident.
      payload.purpose === TOKEN_PURPOSE.session &&
      typeof payload.userId === "string" &&
      typeof payload.name === "string" &&
      typeof payload.email === "string" &&
      isRole(payload.role) &&
      // Required, not optional: a token from before sessions were recorded
      // names no row, cannot be ended, and so cannot be let in. Everybody
      // signs in once more after the upgrade.
      typeof payload.sid === "string"
    ) {
      return {
        userId: payload.userId,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        department: isDepartment(payload.department) ? payload.department : null,
        sessionId: payload.sid,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const session = await verifySessionToken(token);
    if (session) return session;
  }

  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) {
    return verifySessionToken(cookieToken);
  }

  return null;
}

export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

/**
 * The session cookie's flags, shared by sign-in and sign-out so they cannot drift.
 *
 * `Secure` is decided per request (isSecureRequest), not per build, so a
 * plain-HTTP deployment that never set APP_HTTPS still keeps its cookie.
 */
export function sessionCookieOptions(maxAge: number, request: Parameters<typeof isSecureRequest>[0]) {
  return {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
