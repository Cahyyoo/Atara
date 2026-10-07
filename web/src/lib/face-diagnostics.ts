import { MIN_DETECTION_SCORE } from "@/lib/face-quality";

/**
 * What a failed capture actually saw.
 *
 * "No face detected" is true and useless. It covers a detector that saw
 * nothing at all and a detector that saw a face at 0.42 against a floor of
 * 0.5, and those need opposite fixes — one is the camera or the model, the
 * other is a number in this repository.
 *
 * face-api hides the difference by filtering below its own scoreThreshold and
 * returning nothing, so the capture now runs the detector permissively and
 * does its own gating. That is what makes a best-score worth reporting at all.
 *
 * Shown to whoever is standing at the camera, because they are the only person
 * who can tell us what happened.
 */
export interface CaptureDiagnostics {
  /** The video's own dimensions; zero means it was never ready. */
  videoWidth: number;
  videoHeight: number;
  /** How many frames were examined. */
  frames: number;
  /** Frames in which the detector returned anything at all, at any score. */
  framesWithDetection: number;
  /** The highest detector confidence seen, permissive threshold and all. */
  bestScore: number;
  /** Widest the face got, as a fraction of the frame. */
  bestWidth: number;
  /** Mean brightness of the last face box measured, 0-255. */
  luminance: number;
  /** Wall-clock for the whole capture. */
  elapsedMs: number;
}

export function emptyDiagnostics(): CaptureDiagnostics {
  return {
    videoWidth: 0,
    videoHeight: 0,
    frames: 0,
    framesWithDetection: 0,
    bestScore: 0,
    bestWidth: 0,
    luminance: 0,
    elapsedMs: 0,
  };
}

/**
 * One line, dense, for a person to read back to somebody who can act on it.
 *
 * Deliberately not translated. These are measurements, and the point of them
 * is to be copied verbatim into a message — a number that reads differently
 * in two locales is worse than one nobody has to translate.
 */
export function formatDiagnostics(diagnostics: CaptureDiagnostics): string {
  const parts = [
    `video ${diagnostics.videoWidth}x${diagnostics.videoHeight}`,
    `${diagnostics.framesWithDetection}/${diagnostics.frames} frames with a face`,
    `best score ${diagnostics.bestScore.toFixed(2)} (floor ${MIN_DETECTION_SCORE.toFixed(2)})`,
    `widest ${(diagnostics.bestWidth * 100).toFixed(0)}%`,
    `brightness ${Math.round(diagnostics.luminance)}`,
    `${(diagnostics.elapsedMs / 1000).toFixed(1)}s`,
  ];
  return parts.join(" · ");
}
