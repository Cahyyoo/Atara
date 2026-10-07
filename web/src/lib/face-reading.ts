import { assessFrame, dominantReason, type QualityReason } from "@/lib/face-quality";
import { eyesAreClosed, sawBlink, type Point } from "@/lib/face-liveness";
import { emptyDiagnostics, type CaptureDiagnostics } from "@/lib/face-diagnostics";
import type { FrameReading, ServiceResult } from "@/lib/face-service";

/**
 * Turning what dlib measured into a decision.
 *
 * This used to run in the browser, inside the capture loop, because that is
 * where the measurements were. Now that the measuring happens on the server,
 * the deciding follows it -- and that is worth more than the tidiness.
 *
 * Before, a browser with the developer tools open could skip the blink check
 * and post whatever descriptor it liked, because every rule ran on the
 * attacker's own machine. Now the frames are the only thing a caller controls,
 * and the rules run somewhere they cannot be edited. That does not make the
 * check airtight -- a recording of somebody blinking would still pass, and no
 * arrangement of this code changes that -- but it moves the floor up from
 * "anyone who opens the network tab".
 *
 * Pure, so the whole of it can be tested against numbers rather than a webcam.
 */

export type ReadingVerdict =
  | { ok: true; descriptor: number[]; alive: boolean; diagnostics: CaptureDiagnostics }
  | { ok: false; failure: "no-face"; diagnostics: CaptureDiagnostics }
  | {
      ok: false;
      failure: "poor-quality";
      reason: QualityReason;
      diagnostics: CaptureDiagnostics;
    };

function toPoints(pairs: [number, number][]): Point[] {
  return pairs.map(([x, y]) => ({ x, y }));
}

/** Whether a single frame is well enough framed to enrol or match on. */
export function assessReading(reading: FrameReading) {
  return assessFrame({
    score: reading.score,
    width: reading.box.width,
    centreX: reading.box.x + reading.box.width / 2,
    centreY: reading.box.y + reading.box.height / 2,
    luminance: reading.luminance,
  });
}

export interface JudgeOptions {
  /** The camera's own dimensions, which only the browser can know. */
  videoWidth?: number;
  videoHeight?: number;
}

/**
 * The verdict on one burst.
 *
 * The two failures are kept apart on purpose. "Saw nobody" points at the
 * camera, the lighting or the lens; "saw somebody, never well enough" points
 * at where the person is standing. Telling someone to move closer when the
 * lens is covered sends them to fix the wrong thing.
 */
export function judgeBurst(
  result: ServiceResult,
  options: JudgeOptions = {}
): ReadingVerdict {
  const diagnostics: CaptureDiagnostics = {
    ...emptyDiagnostics(),
    videoWidth: options.videoWidth ?? 0,
    videoHeight: options.videoHeight ?? 0,
    frames: result.frames.length,
    elapsedMs: result.engine.elapsedMs,
  };

  const refusals: QualityReason[] = [];
  const closedFrames: boolean[] = [];

  for (const reading of result.frames) {
    if (!reading.detected) continue;

    diagnostics.framesWithDetection += 1;
    diagnostics.bestScore = Math.max(diagnostics.bestScore, reading.score);
    diagnostics.bestWidth = Math.max(diagnostics.bestWidth, reading.box.width);
    diagnostics.luminance = reading.luminance;

    closedFrames.push(
      eyesAreClosed(toPoints(reading.leftEye), toPoints(reading.rightEye))
    );

    const verdict = assessReading(reading);
    if (!verdict.ok) refusals.push(verdict.reason);
  }

  if (diagnostics.framesWithDetection === 0) {
    return { ok: false, failure: "no-face", diagnostics };
  }

  /**
   * The frame dlib described has to pass on its own merits.
   *
   * It is chosen by detector score alone, which says nothing about how far
   * away or how dark it was -- so without this, a burst where every frame was
   * too dim would still hand back a descriptor built from the least dim one.
   */
  const best =
    result.bestFrameIndex === null ? null : result.frames[result.bestFrameIndex];

  if (!result.descriptor || !best || !assessReading(best).ok) {
    return {
      ok: false,
      failure: "poor-quality",
      // What was wrong most often, not what was wrong last: the final frame is
      // whichever moment the burst happened to stop on.
      reason: dominantReason(refusals) ?? "qualityUnsure",
      diagnostics,
    };
  }

  return {
    ok: true,
    descriptor: result.descriptor,
    alive: sawBlink(closedFrames),
    diagnostics,
  };
}
