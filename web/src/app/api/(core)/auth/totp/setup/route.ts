import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/core/lib/http/api-response";
import {
  claimNonce,
  signFaceChallenge,
  verifyFaceChallenge,
  CHALLENGE_MAX_AGE_SECONDS,
} from "@/core/lib/face/face-challenge";
import { totpSetupPending } from "@/core/lib/auth/second-factor";
import { recordSignIn, SignInOutcome } from "@/core/lib/auth/sign-in-audit";
import { loginAttemptKey, consumeAttempt } from "@/core/lib/http/rate-limit";
import { readJsonBody } from "@/core/lib/http/api-request";
import { sealSecret } from "@/core/lib/auth/secret-box";
import { formatManualKey, generateTotpSecret, otpauthUri } from "@/core/lib/auth/totp";

const setupSchema = z.object({
  challenge: z.string().min(1),
});

/**
 * Setting up an authenticator, in the middle of signing in.
 *
 * Reachable only with a challenge -- so only after the password was right --
 * and only for an account an admin has asked to use one. The admin flips the
 * switch; the secret is made here and shown once, to the person on the other
 * side of this request, as a QR code for their own phone. Nobody else ever
 * sees it.
 *
 * Nothing is live yet. The factor only counts once the first code from the
 * phone is accepted by /api/auth/totp, which is also what signs them in. Until
 * then, calling this again simply replaces the secret: a QR code that was
 * scanned wrongly or not at all costs nothing.
 *
 * A fresh challenge comes back with it. Finding the app, adding an account
 * and pointing the camera at the screen takes longer than the two minutes the
 * first one had left. The one it arrived with is spent first: otherwise each
 * call would mint a new two minutes from the same password proof, forever.
 *
 * For an account that signs in by face, the challenge must be one the face
 * step issued after a match. This route used to accept any challenge, and
 * the password step hands those out -- so an admin's pending request quietly
 * made the account password-only until somebody finished the setup, and the
 * somebody could be anyone holding the password.
 */
export async function POST(request: NextRequest) {
  try {
    const body = setupSchema.parse(await readJsonBody(request));

    const challenge = await verifyFaceChallenge(body.challenge);
    if (!challenge) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    const clientKey = loginAttemptKey(request.headers, challenge.userId);
    if (!consumeAttempt(clientKey)) {
      throw new ApiError("Too many sign-in attempts. Please wait a few minutes.", 429);
    }

    const user = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        lockedUntil: true,
        totpRequestedAt: true,
        totpEnabledAt: true,
        faceEnrollments: { select: { id: true }, take: 1 },
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.ACCOUNT_LOCKED,
        headers: request.headers,
      });
      throw new ApiError("Too many failed attempts. Please try again later.", 429);
    }

    /**
     * Only while a setup is pending.
     *
     * Once an authenticator is live, replacing it is an admin's decision.
     * Allowing it here would let anybody who learned the password swap the
     * owner's phone for their own, and the second factor would be worth
     * exactly as much as the first.
     */
    if (!totpSetupPending(user)) {
      throw new ApiError("No authenticator setup is waiting for this account.", 409);
    }

    if (user.faceEnrollments.length > 0 && !challenge.faceVerified) {
      throw new ApiError(
        "This account signs in with a face. Verify it first, then set up the authenticator.",
        403
      );
    }

    // Spent before anything is handed out, so one password proof buys one
    // setup, not a standing supply of fresh challenges.
    if (!(await claimNonce(challenge.nonce))) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: sealSecret(secret), totpLastUsedStep: null },
    });

    return jsonSuccess({
      otpauthUri: otpauthUri({ account: user.email, secret }),
      manualKey: formatManualKey(secret),
      // Carries the face forward: the code step checks it again.
      challenge: await signFaceChallenge(user.id, { faceVerified: challenge.faceVerified }),
      expiresIn: CHALLENGE_MAX_AGE_SECONDS,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
