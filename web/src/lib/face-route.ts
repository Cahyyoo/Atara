import "server-only";

import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api-response";
import type { ReadingVerdict } from "@/lib/face-reading";
import type { CaptureDiagnostics } from "@/lib/face-diagnostics";

/**
 * How a route answers when the face was the problem.
 *
 * Two routes take a burst and can refuse it -- signing in and enrolling --
 * and they used to be able to drift into reporting the same failure with
 * different codes, or one with the numbers and one without. One place for
 * the shape, so a client written against either works against both.
 *
 * The `code` is what the client switches on; the message is a fallback for a
 * client that does not. The diagnostics ride in `details` because they are the
 * only thing the person at the camera can read back to somebody who can act.
 */

export const FACE_FAILURE = {
  noFace: "no-face",
  poorQuality: "poor-quality",
  notAlive: "not-alive",
  serviceDown: "service-down",
  serviceBusy: "service-busy",
} as const;

export interface FaceFailureDetails {
  diagnostics: CaptureDiagnostics;
  /** Present for poor-quality only: a QualityReason message key. */
  reason?: string;
}

export function readingRefused(reading: Extract<ReadingVerdict, { ok: false }>) {
  if (reading.failure === "no-face") {
    return jsonError(
      "No face was found. Please try again.",
      400,
      { diagnostics: reading.diagnostics } satisfies FaceFailureDetails,
      FACE_FAILURE.noFace
    );
  }
  return jsonError(
    "That reading was not clear enough. Please try again.",
    400,
    { diagnostics: reading.diagnostics, reason: reading.reason } satisfies FaceFailureDetails,
    FACE_FAILURE.poorQuality
  );
}

export function notAlive(diagnostics: CaptureDiagnostics) {
  return jsonError(
    "No blink was detected. Please try again.",
    400,
    { diagnostics } satisfies FaceFailureDetails,
    FACE_FAILURE.notAlive
  );
}

/**
 * The service did not answer.
 *
 * 503 and a code, never a session. See the comment on the sign-in route for
 * why this does not quietly fall back to the password alone.
 */
export function serviceDown() {
  return jsonError(
    "Face recognition is temporarily unavailable. Please contact an administrator.",
    503,
    undefined,
    FACE_FAILURE.serviceDown
  );
}

/**
 * The service is up and every worker is taken.
 *
 * 503 like an outage, but a different code and a Retry-After, because the
 * person at the camera should be told to wait a moment -- not to contact an
 * administrator about a service that is working exactly as hard as it can.
 * The request never reached the service, so retrying costs it nothing.
 */
export function serviceBusy() {
  return jsonError(
    "Face recognition is busy right now. Please try again in a moment.",
    503,
    undefined,
    FACE_FAILURE.serviceBusy,
    { "Retry-After": "3" }
  );
}

/** Where the frames came from, for the diagnostics line only. */
export function videoDimensions(body: { videoWidth?: number; videoHeight?: number }) {
  return { videoWidth: body.videoWidth, videoHeight: body.videoHeight };
}

export type { NextRequest };
