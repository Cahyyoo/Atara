import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/core/lib/http/api-response";
import { loginAttemptKey, consumeAttempt, resetAttempts } from "@/core/lib/http/rate-limit";
import { readJsonBody, BODY_LIMIT } from "@/core/lib/http/api-request";
import { signFaceChallenge, CHALLENGE_MAX_AGE_SECONDS } from "@/core/lib/face/face-challenge";
import { recordSignIn, SignInOutcome } from "@/core/lib/auth/sign-in-audit";
import { registerFailedAttempt, clearFailedAttempts } from "@/core/lib/auth/login-lockout";
import { issueSessionResponse } from "@/core/lib/auth/session-response";
import { secondFactorMethods } from "@/core/lib/auth/second-factor";

const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
  /**
   * Accepted and ignored. Clients built while sign-in asked "continue here?"
   * still send these; the latest sign-in now simply wins, so there is nothing
   * left for them to change, and refusing them would lock those clients out.
   */
  canConfirmTakeover: z.boolean().optional(),
  takeover: z.boolean().optional(),
});

/**
 * Compared against when the email is unknown, so an unregistered address costs
 * the same time as a registered one and cannot be told apart by response time.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("atara-timing-guard", 10);

function minutesUntil(date: Date): number {
  return Math.max(1, Math.ceil((date.getTime() - Date.now()) / 60_000));
}

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await readJsonBody(request, BODY_LIMIT.login));
    const email = body.email.trim().toLowerCase();

    // Counted per address where one can be trusted, per account otherwise.
    const clientKey = loginAttemptKey(request.headers, email);
    if (!consumeAttempt(clientKey)) {
      throw new ApiError("Too many sign-in attempts. Please wait a few minutes.", 429);
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always runs, even with no such user — see DUMMY_PASSWORD_HASH — and
    // before the lock is looked at, so a locked account costs the same time.
    const passwordMatch = await bcrypt.compare(
      body.password,
      user?.password ?? DUMMY_PASSWORD_HASH
    );

    /**
     * A locked account says so only to somebody who knows its password.
     *
     * The lock used to be checked first and answered with its minutes to
     * anybody: five wrong guesses at an address, and the sixth reply told a
     * stranger the account existed (and skipped bcrypt, so it was quicker
     * too). A wrong password now gets the same sentence an unknown address
     * gets, and is not counted again -- the lock is already doing its job.
     */
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.ACCOUNT_LOCKED,
        headers: request.headers,
      });
      if (!passwordMatch) {
        throw new ApiError("Incorrect email or password.", 401);
      }
      throw new ApiError(
        `Too many failed attempts. Try again in ${minutesUntil(user.lockedUntil)} minute(s).`,
        429
      );
    }

    if (!user || !passwordMatch) {
      if (user) {
        await registerFailedAttempt(user);
        await recordSignIn({
          userId: user.id,
          outcome: SignInOutcome.PASSWORD_FAILED,
          headers: request.headers,
        });
      }
      throw new ApiError("Incorrect email or password.", 401);
    }

    if (!user.isActive) {
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.ACCOUNT_INACTIVE,
        headers: request.headers,
      });
      throw new ApiError("This account has been deactivated. Contact an administrator.", 403);
    }

    /**
     * The second factor, and the reason no cookie is set below this point for
     * anyone who has one.
     *
     * The session is withheld until a second step passes. Issuing it here and
     * "also" asking for a face or a code would make that step a formality:
     * the caller would already hold everything it needs and could simply not
     * ask.
     *
     * Only accounts with a second factor are asked. One without is not
     * silently let through a check it was never given -- it has no second
     * factor at all, which is the state every account was in before this
     * existed.
     */
    const enrolledFaces = await prisma.faceEnrollment.count({ where: { userId: user.id } });
    const methods = secondFactorMethods({
      hasFace: enrolledFaces > 0,
      totpEnabledAt: user.totpEnabledAt,
      totpRequestedAt: user.totpRequestedAt,
    });

    if (methods.length > 0) {
      return jsonSuccess({
        mfaRequired: true,
        methods,
        challenge: await signFaceChallenge(user.id),
        expiresIn: CHALLENGE_MAX_AGE_SECONDS,
        // Enough to greet them by name on the next step. No token, no cookie,
        // and nothing that getSessionFromRequest would accept.
        user: { name: user.name },
      });
    }

    /**
     * Cleared here, where the session is issued, and not a moment earlier.
     *
     * It used to be cleared as soon as the password matched, before any
     * second factor -- which handed anybody holding the password an unlimited
     * run at the authenticator code: five wrong codes, sign in again to zero
     * the counter, five more. login-lockout.ts promises one allowance across
     * every step, and a reset in the middle of the steps made that promise
     * empty. The face and authenticator routes clear it on their own success.
     */
    await clearFailedAttempts(user);
    resetAttempts(clientKey);

    await recordSignIn({
      userId: user.id,
      outcome: SignInOutcome.PASSWORD_ONLY,
      headers: request.headers,
    });

    // Awaited, so a failure opening the session reaches the catch below and is
    // answered properly; returned bare, its rejection skipped the catch and the
    // client got an empty 500.
    return await issueSessionResponse(user, request, { mfaRequired: false });
  } catch (error) {
    return handleApiError(error);
  }
}
