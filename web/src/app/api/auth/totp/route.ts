import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, ApiError } from "@/lib/api-response";
import { claimNonce, verifyFaceChallenge } from "@/lib/face-challenge";
import { recordSignIn, SignInOutcome } from "@/lib/sign-in-audit";
import { loginAttemptKey, consumeAttempt, resetAttempts } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/api-request";
import { registerFailedAttempt } from "@/lib/login-lockout";
import { issueSessionResponse } from "@/lib/session-response";
import { openSecret } from "@/lib/secret-box";
import { verifyTotp } from "@/lib/totp";
import { TOTP_MISMATCH_CODE } from "@/lib/second-factor";

const totpSchema = z.object({
  challenge: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "The code is six digits."),
});

/**
 * The second half of signing in, by authenticator code: the other door that
 * issues a session, beside /api/auth/face.
 *
 * Also where a pending setup becomes real. The first code accepted from a
 * freshly scanned QR code both proves the phone has the secret and signs the
 * person in; before that, the authenticator does not count as a factor.
 *
 * Every refusal that is not about the code itself answers the same way, for
 * the same reason as the face step: a caller should not be able to sort their
 * failures into "expired", "spent" and "no such account".
 */
export async function POST(request: NextRequest) {
  try {
    const body = totpSchema.parse(await readJsonBody(request));

    const challenge = await verifyFaceChallenge(body.challenge);
    if (!challenge) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    // Counted like a password attempt, so guessing codes costs the same as
    // guessing passwords.
    const clientKey = loginAttemptKey(request.headers, challenge.userId);
    if (!consumeAttempt(clientKey)) {
      throw new ApiError("Too many sign-in attempts. Please wait a few minutes.", 429);
    }

    const user = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lockedUntil: true,
        failedLoginAttempts: true,
        totpSecret: true,
        totpRequestedAt: true,
        totpEnabledAt: true,
        totpLastUsedStep: true,
        faceEnrollments: { select: { id: true }, take: 1 },
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    // Re-checked here: the account can be locked by another attempt in the
    // minutes between the password and the code.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.ACCOUNT_LOCKED,
        headers: request.headers,
      });
      throw new ApiError("Too many failed attempts. Please try again later.", 429);
    }

    // No secret, or one left behind after an admin switched the factor off.
    if (!user.totpSecret || (!user.totpEnabledAt && !user.totpRequestedAt)) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    /**
     * The first code from a new phone, on an account that signs in by face,
     * is only accepted on a challenge the face step issued. The setup route
     * makes the same check before it hands out a secret; this is the second
     * lock on the same door, for the day somebody removes the first.
     */
    if (!user.totpEnabledAt && user.faceEnrollments.length > 0 && !challenge.faceVerified) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    const step = verifyTotp(body.code, openSecret(user.totpSecret));

    /**
     * A wrong code, or the right code a second time.
     *
     * The second is refused as firmly as the first: a code is on the screen
     * for thirty seconds, long enough to be read over a shoulder, and
     * single-use is the only thing that makes that not matter.
     *
     * Unlike a face mismatch, this does not spend the challenge. A mistyped
     * digit is the common case, and sending somebody back to the password
     * for it would be all cost; the shared lockout already bounds guessing.
     */
    const replayed =
      step !== null && user.totpLastUsedStep !== null && step <= user.totpLastUsedStep;
    if (step === null || replayed) {
      await registerFailedAttempt(user);
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.TOTP_MISMATCH,
        headers: request.headers,
      });
      throw new ApiError("That code is not correct.", 401, TOTP_MISMATCH_CODE);
    }

    // Single use, claimed once the code is known to be right: this challenge
    // becomes exactly one session.
    if (!(await claimNonce(challenge.nonce))) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    const enrolling = !user.totpEnabledAt;

    /**
     * Conditional on the step, so two requests racing with the same code
     * cannot both get through: only one of them moves the step forward.
     */
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
      },
      data: {
        totpLastUsedStep: step,
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(enrolling ? { totpEnabledAt: new Date() } : {}),
      },
    });
    if (updated.count === 0) {
      throw new ApiError("That code is not correct.", 401, TOTP_MISMATCH_CODE);
    }
    resetAttempts(clientKey);

    await recordSignIn({
      userId: user.id,
      outcome: enrolling ? SignInOutcome.TOTP_ENROLLED : SignInOutcome.TOTP_VERIFIED,
      headers: request.headers,
    });

    // Awaited, so a failure opening the session reaches the catch below and is
    // answered properly; returned bare, its rejection skipped the catch and the
    // client got an empty 500.
    return await issueSessionResponse(user, request.headers);
  } catch (error) {
    return handleApiError(error);
  }
}
