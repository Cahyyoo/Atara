import { SignJWT, jwtVerify } from "jose";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TOKEN_PURPOSE } from "@/lib/auth";
import { assertJwtSecret } from "@/lib/env-guard";

/**
 * The token that sits between the password step and the second factor.
 *
 * Named for the face because that came first; the authenticator step
 * (/api/auth/totp and its setup) accepts the same token. One challenge for
 * both is what lets somebody switch from the camera to their phone without
 * typing the password again, and the nonce below still makes it good for one
 * session whichever door it goes through.
 *
 * It is not a session and must never become one. Two things keep it apart,
 * because one would be fragile:
 *
 *   1. It carries `purpose: "face-challenge"`, which verifySessionToken
 *      refuses. That is the check that does the work.
 *   2. It deliberately carries no `name`, `email` or `role`, so even if the
 *      purpose check were ever removed it would still fail the shape check
 *      that follows it.
 *
 * The second exists because the first is one deletion away from being gone,
 * and the failure is silent: the app keeps working, the face step keeps
 * appearing, and it stops meaning anything.
 */

/** Long enough to face a camera, too short to be worth stealing. */
export const CHALLENGE_MAX_AGE_SECONDS = 120;

export interface FaceChallenge {
  userId: string;
  nonce: string;
  /**
   * True only on a challenge the face step issued after a match.
   *
   * The authenticator setup for an account that signs in by face is only
   * allowed to start from one of these. Without it, an admin pressing
   * "request authenticator" on a face-enrolled account quietly turned that
   * account into a password-only one for as long as the request stood: the
   * setup route asked for a valid challenge, and the password step hands
   * those out. Somebody holding the password could bind their own phone as
   * the account's permanent second factor and never be asked for the face.
   *
   * Never inferred and never defaulted to true: a plain challenge decodes
   * with this false, and only signFaceChallenge can set it.
   */
  faceVerified: boolean;
}

let secretKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (!secretKey) {
    // The same refusal auth.ts makes; see env-guard.ts.
    secretKey = new TextEncoder().encode(assertJwtSecret(process.env.JWT_SECRET));
  }
  return secretKey;
}

const VERIFY_OPTIONS = { algorithms: ["HS256"] };

export async function signFaceChallenge(
  userId: string,
  options: { faceVerified?: boolean } = {}
): Promise<string> {
  return new SignJWT({
    purpose: TOKEN_PURPOSE.faceChallenge,
    userId,
    nonce: crypto.randomUUID(),
    // Present only when true, so a token that never had the claim and one
    // that was issued without it are the same token.
    ...(options.faceVerified ? { faceVerified: true } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyFaceChallenge(token: string): Promise<FaceChallenge | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), VERIFY_OPTIONS);
    if (
      payload.purpose === TOKEN_PURPOSE.faceChallenge &&
      typeof payload.userId === "string" &&
      typeof payload.nonce === "string"
    ) {
      return {
        userId: payload.userId,
        nonce: payload.nonce,
        faceVerified: payload.faceVerified === true,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Nonces already spent, so a captured challenge cannot be replayed within its
 * two minutes.
 *
 * In the database, and the primary key is the whole mechanism: the first
 * insert wins and the second fails on the key, atomically, however many
 * processes are asking. There is no read-then-write for two requests to slip
 * between.
 *
 * It used to be a Map inside one process, which could only promise "exactly
 * once" to that one process. Its own comment said a second instance would
 * break it and that this was "worth knowing rather than discovering" -- but a
 * replay landing on the other worker would have gone unreported, so nobody
 * would have discovered it either. A guarantee that depends on the deployment
 * shape is not a guarantee.
 */

/**
 * True the first time a nonce is seen, false every time after.
 *
 * `now` stays a parameter so expiry can be tested without waiting two minutes.
 */
export async function claimNonce(nonce: string, now: number = Date.now()): Promise<boolean> {
  const at = new Date(now);

  /**
   * Expired rows go first, and only then is the claim attempted.
   *
   * Without this, a nonce whose two minutes are up would still collide with
   * its own old row and be refused -- the expiry would quietly stop meaning
   * anything. Swept as they are passed rather than on a timer: a sweep that
   * needs a scheduler is a sweep that stops when the scheduler does.
   */
  await prisma.spentChallenge.deleteMany({ where: { expiresAt: { lte: at } } });

  try {
    await prisma.spentChallenge.create({
      data: { nonce, expiresAt: new Date(now + CHALLENGE_MAX_AGE_SECONDS * 1000) },
    });
    return true;
  } catch (error) {
    // P2002 is the unique violation: somebody already spent this one. Any
    // other failure is not a spent nonce and must not be reported as one --
    // refusing a sign-in because the database hiccuped is a different
    // sentence, and it belongs to the caller's error handling.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

/** Test seam: spent nonces outlive a single request by design. */
export async function resetNonces(): Promise<void> {
  await prisma.spentChallenge.deleteMany({});
}
