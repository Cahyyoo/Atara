import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { loadSession } from "@/lib/session-user";
import { verifyFaceChallenge } from "@/lib/face-challenge";
import { readJsonBody, BODY_LIMIT } from "@/lib/api-request";
import { consumeAttempt } from "@/lib/rate-limit";
import { MAX_FRAME_CHARS } from "@/lib/face-burst";
import {
  analyseFrames,
  FaceServiceBusyError,
  FaceServiceUnavailableError,
} from "@/lib/face-service";
import { assessReading } from "@/lib/face-reading";
import { serviceBusy, serviceDown } from "@/lib/face-route";

const previewSchema = z.object({
  frame: z.string().min(1).max(MAX_FRAME_CHARS),
  /** Accepted in place of a session while the password step's challenge is live. */
  challenge: z.string().min(1).optional(),
});

/**
 * How often one person may ask. The guide asks every 300ms, a little over
 * three a second (PREVIEW_INTERVAL_MS in face-camera.tsx); five a second
 * leaves room for a retry without letting a script run the detector flat out
 * on one challenge. Lower this below the guide's own rate and the guide
 * stops itself with "busy" for somebody doing nothing wrong.
 */
const PREVIEW_LIMIT = { limit: 20, windowMs: 4000 };

/**
 * "Am I standing in the right place?" -- asked a few times a second while the
 * camera is on, answered without a descriptor.
 *
 * This is what lets the guide turn green before Verify is pressed instead of
 * only explaining afterwards. The recogniser is left out (describe: false),
 * which is the difference between ~15ms and ~400ms and so between a guide
 * that follows somebody and one that lags behind them.
 *
 * Nothing about the face comes back: only whether one was found, whether it
 * passed the framing checks, and if not, which one. No box, no landmarks.
 * A caller polling this learns where to stand and nothing else.
 *
 * Who may ask: anyone with a session, or anyone holding a live challenge from
 * the password step. The challenge is verified but not claimed, because it
 * has to survive until the real burst arrives. Without one of the two this is
 * an open face detector on the internet, which it must not be.
 *
 * The session is checked from the cookie *before* the body is read, and the
 * body is capped, because this route used to parse a 30KB frame from anyone
 * and only then ask who they were -- the cheapest way there was to make the
 * one Node process do work for nobody. A deactivated account is refused too:
 * a session's signature says who it was issued to, not whether they still
 * exist.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = sessionToken ? await verifySessionToken(sessionToken) : null;
    // Only a session that is still this device's counts; one another device
    // took over falls through to the challenge, like no session at all.
    const state = session ? await loadSession(session.sessionId, session.userId) : null;
    const user = state?.status === "active" ? state : null;

    const body = previewSchema.parse(await readJsonBody(request, BODY_LIMIT.preview));

    const challenge = !user && body.challenge ? await verifyFaceChallenge(body.challenge) : null;
    const askerId = user ? session!.userId : challenge?.userId;
    if (!askerId) {
      throw new ApiError("Authentication required.", 401);
    }

    if (!consumeAttempt(`preview:${askerId}`, PREVIEW_LIMIT)) {
      throw new ApiError("Too many preview requests. Please slow down.", 429);
    }

    const result = await analyseFrames([body.frame], { describe: false });
    const reading = result.frames[0];

    if (!reading?.detected) {
      return jsonSuccess({ detected: false, ok: false, reason: "qualityUnsure" });
    }

    const verdict = assessReading(reading);
    return jsonSuccess(
      verdict.ok
        ? { detected: true, ok: true, reason: null }
        : { detected: true, ok: false, reason: verdict.reason }
    );
  } catch (error) {
    if (error instanceof FaceServiceBusyError) {
      return serviceBusy();
    }
    if (error instanceof FaceServiceUnavailableError) {
      return serviceDown();
    }
    return handleApiError(error);
  }
}
