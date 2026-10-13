import "server-only";

import { Semaphore, QueueFullError } from "@/core/lib/semaphore";

/**
 * Talking to the dlib service.
 *
 * Server-only, and the `server-only` import above is what enforces it: the
 * token must not reach a browser, and neither must the ability to turn frames
 * into a descriptor at will. Frames travel browser -> route handler -> here.
 *
 * The service itself lives in ../../face and refuses to bind anything but
 * loopback, so this is the only thing that can reach it.
 */

export interface FrameReading {
  detected: boolean;
  score: number;
  box: { x: number; y: number; width: number; height: number };
  /** Six points per eye, in the order eyeAspectRatio expects. */
  leftEye: [number, number][];
  rightEye: [number, number][];
  luminance: number;
}

export interface ServiceResult {
  frames: FrameReading[];
  descriptor: number[] | null;
  bestFrameIndex: number | null;
  engine: { detector: string; elapsedMs: number };
}

/**
 * The service is not answering.
 *
 * Kept distinct from every other failure because it is the only one where
 * nothing is wrong with the person in front of the camera. The sign-in route
 * answers it with a 503 and no session -- it does not fall back to the
 * password alone, and the audit trail records the outage (FACE_SERVICE_DOWN).
 */
export class FaceServiceUnavailableError extends Error {
  constructor(readonly cause?: unknown) {
    super("face-service-unavailable");
    this.name = "FaceServiceUnavailableError";
  }
}

/**
 * The service is up, and every worker is already busy.
 *
 * Not the same thing as down, and the difference is what the person at the
 * camera is told: "down" halts the camera and says to contact an
 * administrator, which at shift change -- the one time this happens -- is
 * exactly wrong. "Busy" is a three-second wait and a retry, and it costs the
 * service nothing because the request never reached it.
 */
export class FaceServiceBusyError extends Error {
  constructor() {
    super("face-service-busy");
    this.name = "FaceServiceBusyError";
  }
}

const DEFAULT_URL = "http://127.0.0.1:8001";

/**
 * Long enough for a full burst, short enough that a wedged service does not
 * hold a sign-in open.
 *
 * Measured: twelve 640x480 frames take about 950ms end to end, and the
 * recogniser is ~380ms of it. Five seconds is roughly five times the worst
 * measured case, which leaves room for a cold first request without leaving
 * somebody watching a spinner for a service that is never going to answer.
 *
 * The clock starts before the request queues for a slot, not after: queue
 * time is time the person is waiting too.
 */
export const TIMEOUT_MS = 5000;

/** The live guide asks often and must not queue behind anything. */
export const PREVIEW_TIMEOUT_MS = 1500;

/** The header that tells the service when this side will stop listening. */
export const DEADLINE_HEADER = "X-Face-Deadline";

/**
 * How many bursts may be in flight, and how many may wait behind them.
 *
 * Sized to the service's worker count: each worker computes one burst at a
 * time, so sending more than that only lengthens a queue nobody can time
 * out. FACE_WORKERS is the same variable the service reads, so the two stay
 * in step by construction. A preview that cannot start now is worth nothing
 * in half a second, so previews never queue at all.
 *
 * At 100 sign-ins a minute with one retry each -- shift change -- four slots
 * run at ~77% and the 95th-percentile wait is about two seconds: inside the
 * five-second budget, with the eight-deep queue rarely touched.
 */
function workerCount(): number {
  const parsed = Number(process.env.FACE_WORKERS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4;
}

const bursts = new Semaphore(workerCount(), 2 * workerCount());
const previews = new Semaphore(workerCount(), 0);

/** For /api/health: is the gate the thing people are waiting on? */
export function faceQueueStatus() {
  return { bursts: bursts.status(), previews: previews.status() };
}

function serviceUrl(): string {
  return process.env.FACE_SERVICE_URL || DEFAULT_URL;
}

function serviceToken(): string {
  const token = process.env.FACE_SERVICE_TOKEN;
  if (!token) {
    // A missing token is a deployment that was never finished, not a runtime
    // condition to degrade around. Saying so here beats a 401 from the
    // service that reads as "that face did not match".
    throw new Error(
      "FACE_SERVICE_TOKEN is not set. See face/README.md; it must match the service's own .env."
    );
  }
  return token;
}

interface AnalyseOptions {
  /** False measures framing only and skips the ~380ms recogniser pass. */
  describe?: boolean;
}

/**
 * Hand a burst of JPEG frames to dlib and get numbers back.
 *
 * Throws FaceServiceUnavailableError for anything that means "the service did
 * not answer" -- refused connection, timeout, a 5xx -- FaceServiceBusyError
 * when there is no room to even ask, and a plain Error for anything that
 * means "the service answered and said no", which is a bug here rather than
 * an outage.
 */
export async function analyseFrames(
  frames: string[],
  options: AnalyseOptions = {}
): Promise<ServiceResult> {
  const describe = options.describe !== false;
  const budget = describe ? TIMEOUT_MS : PREVIEW_TIMEOUT_MS;
  const deadline = Date.now() + budget;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);

  let release: () => void;
  try {
    release = await (describe ? bursts : previews).acquire();
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof QueueFullError) throw new FaceServiceBusyError();
    throw error;
  }

  // Waited its turn and the turn arrived too late: refuse here rather than
  // send work the service would then be told to discard.
  if (controller.signal.aborted) {
    release();
    throw new FaceServiceUnavailableError("timeout while queued");
  }

  let response: Response;
  try {
    response = await fetch(`${serviceUrl()}/descriptor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Face-Token": serviceToken(),
        // The service checks this before each frame and skips what this side
        // has already stopped waiting for. Loopback, so no clock skew.
        [DEADLINE_HEADER]: String(deadline),
      },
      body: JSON.stringify({ frames, describe, jitters: 1 }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    // Refused, unreachable, aborted: all the same thing to a caller.
    throw new FaceServiceUnavailableError(error);
  } finally {
    clearTimeout(timer);
    release();
  }

  if (response.status >= 500) {
    throw new FaceServiceUnavailableError(response.status);
  }
  if (!response.ok) {
    // 400 and 422 mean this file sent something the service would not take,
    // which no amount of standing differently in front of a camera will fix.
    throw new Error(`Face service refused the request (${response.status}).`);
  }

  return (await response.json()) as ServiceResult;
}

/** Whether the service is up, for the health endpoint. */
export async function isFaceServiceUp(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const response = await fetch(`${serviceUrl()}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
