/**
 * Whether a frame is worth enrolling, and where to stand so it is.
 *
 * The capture used to keep whichever frame scored highest with no floor at
 * all, so a small, dim, half-turned face was stored as a valid reading. The
 * cost of that lands the next morning and every morning after, on the preparator
 * who cannot sign in — not on the admin who took it.
 *
 * This file is the single source of those numbers. The guide drawn over the
 * camera is derived from the same constants, because a guide that tells
 * somebody to stand where the checker will then refuse them is worse than no
 * guide at all.
 *
 * None of these were measured in your lab. They are reasoned defaults — the
 * detector's own documented floor, and the geometry of "a face big enough to
 * describe". Named so they can be moved once the behaviour is seen on real
 * benches, rather than buried in a condition.
 */

/** Below this the detector is not confident it found a face at all. */
export const MIN_DETECTION_SCORE = 0.5;

/** A face narrower than this is too far away to describe in any detail. */
export const MIN_FACE_WIDTH = 0.25;

/** Past this the frame is cropping the chin or the forehead. */
export const MAX_FACE_WIDTH = 0.8;

/** How far the face's centre may sit from the frame's, as a fraction. */
export const MAX_CENTRE_OFFSET = 0.25;

/** Mean brightness of the face itself, 0-255. Below this the features flatten. */
export const MIN_FACE_LUMINANCE = 40;

/**
 * Why a frame was refused. Each is a message key, so a reason can be shown
 * without a lookup table that could fall out of step with this list.
 *
 * An array rather than a bare union, because a union is erased at build time
 * and these keys are reached through `t(reason)` -- invisible to any scan of
 * the source. The test that refuses unused messages imports this, so the list
 * and the messages cannot drift apart without something failing.
 */
export const QUALITY_REASONS = [
  "qualityUnsure",
  "qualityTooFar",
  "qualityTooClose",
  "qualityOffCentre",
  "qualityTooDark",
] as const;

export type QualityReason = (typeof QUALITY_REASONS)[number];

export interface FrameMeasurement {
  /** The detector's own confidence, 0-1. */
  score: number;
  /** Face width as a fraction of frame width. */
  width: number;
  /** Face centre, as fractions of the frame: 0.5, 0.5 is dead centre. */
  centreX: number;
  centreY: number;
  /** Mean brightness inside the face box, 0-255. */
  luminance: number;
}

export type FrameVerdict = { ok: true } | { ok: false; reason: QualityReason };

/**
 * Checked in the order somebody would fix them.
 *
 * "Not sure that is a face" first, because every other measurement is taken
 * from a box that may not be a face at all. Distance next, because it is the
 * one most often wrong and the easiest to correct. Light last: it is the
 * hardest to do anything about at a bench, so it should not mask a problem
 * that could simply be stepped closer to.
 */
export function assessFrame(measurement: FrameMeasurement): FrameVerdict {
  if (measurement.score < MIN_DETECTION_SCORE) {
    return { ok: false, reason: "qualityUnsure" };
  }
  if (measurement.width < MIN_FACE_WIDTH) {
    return { ok: false, reason: "qualityTooFar" };
  }
  if (measurement.width > MAX_FACE_WIDTH) {
    return { ok: false, reason: "qualityTooClose" };
  }

  const offset = Math.hypot(measurement.centreX - 0.5, measurement.centreY - 0.5);
  if (offset > MAX_CENTRE_OFFSET) {
    return { ok: false, reason: "qualityOffCentre" };
  }

  if (measurement.luminance < MIN_FACE_LUMINANCE) {
    return { ok: false, reason: "qualityTooDark" };
  }

  return { ok: true };
}

/**
 * Which refusal to report for a whole run of frames.
 *
 * The most common one, not the last. The final frame is whichever moment the
 * loop happened to stop on — somebody lowering their head, a hand passing
 * through — and reporting that would send them to fix something that was only
 * true for an instant.
 *
 * Ties go to the first seen, which is the earliest in the fix-it order above.
 */
export function dominantReason(reasons: QualityReason[]): QualityReason | null {
  if (reasons.length === 0) return null;

  const counts = new Map<QualityReason, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  let best = reasons[0];
  for (const [reason, count] of counts) {
    if (count > (counts.get(best) ?? 0)) best = reason;
  }
  return best;
}

/**
 * The guide oval, as fractions of the frame.
 *
 * Derived, never written down separately. Width sits between the two limits so
 * a face that fills the oval is comfortably inside both, and the height uses
 * the rough 1.3 ratio of a head — an oval as wide as it is tall invites people
 * to fill it sideways and get refused for being too close.
 */
export const GUIDE = {
  width: (MIN_FACE_WIDTH + MAX_FACE_WIDTH) / 2,
  get height() {
    return this.width * 1.3;
  },
} as const;
