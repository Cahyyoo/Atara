import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonSuccess, ApiError } from "@/lib/api-response";
import {
  claimNonce,
  signFaceChallenge,
  verifyFaceChallenge,
  CHALLENGE_MAX_AGE_SECONDS,
} from "@/lib/face-challenge";
import { bytesToDescriptor, matchDescriptor } from "@/lib/face-match";
import {
  analyseFrames,
  FaceServiceBusyError,
  FaceServiceUnavailableError,
} from "@/lib/face-service";
import { judgeBurst } from "@/lib/face-reading";
import { burstSchema } from "@/lib/face-burst";
import {
  notAlive,
  readingRefused,
  serviceBusy,
  serviceDown,
  videoDimensions,
} from "@/lib/face-route";
import { recordSignIn, SignInOutcome } from "@/lib/sign-in-audit";
import { loginAttemptKey, consumeAttempt, resetAttempts } from "@/lib/rate-limit";
import { readJsonBody, BODY_LIMIT } from "@/lib/api-request";
import { registerFailedAttempt, clearFailedAttempts } from "@/lib/login-lockout";
import { issueSessionResponse } from "@/lib/session-response";
import { totpSetupPending } from "@/lib/second-factor";

const faceSchema = burstSchema.extend({
  challenge: z.string().min(1),
});

/**
 * The second half of signing in, by face: one of the two steps that actually
 * issue a session. The other is /api/auth/totp.
 *
 * The password step returns a challenge and no cookie, so these are the only
 * doors. A caller arriving here with a valid challenge has already proved the
 * password; what remains is the face.
 *
 * What arrives is the frames themselves rather than a descriptor the browser
 * worked out. That matters for more than tidiness: a descriptor is a
 * replayable credential, and one computed in a browser could be captured once
 * and posted forever after without a camera. Frames go in, a session comes
 * out, and the descriptor never exists anywhere a caller can reach.
 *
 * Every refusal answers the same way. Telling a caller whether the challenge
 * expired, was already spent, or simply did not match would let them sort
 * their own failures into useful categories.
 */
export async function POST(request: NextRequest) {
  // Hoisted so the catch below can attribute a service outage to the account
  // it happened to, rather than losing the one failure that is nobody's fault
  // but ours.
  let userId: string | null = null;

  try {
    const body = faceSchema.parse(await readJsonBody(request, BODY_LIMIT.burst));

    const challenge = await verifyFaceChallenge(body.challenge);
    if (!challenge) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }
    userId = challenge.userId;

    // Counted like a password attempt, so guessing at the face step costs the
    // same as guessing at the first one.
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
        totpRequestedAt: true,
        totpEnabledAt: true,
        faceEnrollments: { select: { descriptor: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    // Re-checked here and not only at the password step: the account can be
    // locked by another attempt in the two minutes between the two.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.ACCOUNT_LOCKED,
        headers: request.headers,
      });
      throw new ApiError("Too many failed attempts. Please try again later.", 429);
    }

    const reading = judgeBurst(await analyseFrames(body.frames), videoDimensions(body));

    /**
     * A bad reading is not a failed attempt, and does not spend the challenge.
     *
     * Standing too far from the camera is not a guess at somebody's face, and
     * counting it towards a lockout would mean a dim bench could lock an
     * operator out of their own account five shots into the morning.
     */
    if (!reading.ok) {
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.FACE_UNREADABLE,
        headers: request.headers,
      });
      return readingRefused(reading);
    }

    /**
     * The blink, checked here rather than in the browser.
     *
     * It was computed in the browser before, which meant the only machine
     * asked to prove it was alive was the one with an interest in the answer.
     * It is still not proof -- a recording of somebody blinking would pass --
     * but it is no longer a check the caller can simply delete.
     */
    if (!reading.alive) {
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.FACE_UNREADABLE,
        headers: request.headers,
      });
      return notAlive(reading.diagnostics);
    }

    /**
     * Single use, claimed here rather than on arrival.
     *
     * It used to be claimed before any of the work, and the comment then said
     * that was to stop one challenge paying for unlimited bursts. That reason
     * was thinner than it looked -- consumeAttempt above already bounds them --
     * and the cost turned out to be real: the camera now fires by itself when
     * the framing is right, so a missed blink is a routine event, and claiming
     * on arrival meant every one of them sent somebody back to the password
     * field.
     *
     * What the nonce is actually for is stopping a captured challenge being
     * matched twice, and that is exactly where it now sits: past every refusal
     * that proves nothing, immediately before the comparison that does.
     */
    if (!(await claimNonce(challenge.nonce))) {
      throw new ApiError("That sign-in attempt has expired. Please start again.", 401);
    }

    const result = matchDescriptor(
      Float32Array.from(reading.descriptor),
      user.faceEnrollments.map((enrollment) => bytesToDescriptor(enrollment.descriptor))
    );

    if (!result.matched) {
      await registerFailedAttempt(user);
      await recordSignIn({
        userId: user.id,
        outcome: SignInOutcome.FACE_MISMATCH,
        headers: request.headers,
      });
      throw new ApiError("That face did not match this account.", 401);
    }

    await clearFailedAttempts(user);
    resetAttempts(clientKey);

    // The one row that says a person was here, and not merely that somebody
    // held their password.
    await recordSignIn({
      userId: user.id,
      outcome: SignInOutcome.FACE_VERIFIED,
      headers: request.headers,
    });

    /**
     * Matched, and an authenticator setup is waiting: hand over rather than
     * sign in.
     *
     * Binding a phone to this account is a decision the face has to be
     * present for. The setup route only accepts a challenge marked here, so
     * the password alone can no longer start it -- which it could, for as
     * long as an admin's request stood. The session follows when the first
     * code is accepted, and the audit shows both rows: this face, then
     * TOTP_ENROLLED.
     */
    if (totpSetupPending(user)) {
      return jsonSuccess({
        mfaRequired: true,
        methods: ["totp-setup"],
        challenge: await signFaceChallenge(user.id, { faceVerified: true }),
        expiresIn: CHALLENGE_MAX_AGE_SECONDS,
        user: { name: user.name },
      });
    }

    // Awaited, so a failure opening the session reaches the catch below and is
    // answered properly; returned bare, its rejection skipped the catch and the
    // client got an empty 500.
    return await issueSessionResponse(user, request.headers);
  } catch (error) {
    /**
     * A face service that is down does not quietly become a sign-in that skips
     * the face.
     *
     * There is now a table this could be written into, which was the stated
     * reason for refusing outright -- a silent fall back to one factor would
     * have left nothing to show it had happened. The behaviour is still a
     * refusal, because turning a hard failure into a soft one is a decision to
     * take deliberately rather than inherit from adding a log. What has
     * changed is that the outage is on the record.
     *
     * The challenge is not spent on the way out, so an account with an
     * authenticator can switch to it and finish signing in. One without is
     * let back in the documented way: an admin removes their enrolment
     * through DELETE /api/users/[id]/face.
     */
    // Every worker is taken. Not an outage and not this person's fault: no
    // audit row, no spent challenge, a three-second retry on the client.
    if (error instanceof FaceServiceBusyError) {
      return serviceBusy();
    }
    if (error instanceof FaceServiceUnavailableError) {
      if (userId) {
        await recordSignIn({
          userId,
          outcome: SignInOutcome.FACE_SERVICE_DOWN,
          headers: request.headers,
        }).catch(() => undefined);
      }
      return serviceDown();
    }
    return handleApiError(error);
  }
}
