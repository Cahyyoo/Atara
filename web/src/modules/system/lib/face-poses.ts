/**
 * What to do for each enrolment reading, in order.
 *
 * Five identical photographs only recognise one angle, which is the whole
 * reason for taking five — and nothing on screen used to say so, leaving the
 * admin to guess whether the third reading differed from the first at all.
 *
 * A module of its own rather than a constant inside the dialog, so the test
 * that checks for unused messages can import it. These keys are reached
 * through `t(poseHintKey(n))`, which no scanner reading source text can see as
 * a use; importing the list is what keeps it honest without a hand-kept copy
 * that would drift.
 */
export const POSE_HINTS = [
  "poseFront",
  "poseLeft",
  "poseRight",
  "poseDown",
  "poseFrontAgain",
] as const;

export type PoseHintKey = (typeof POSE_HINTS)[number];

/**
 * Wrapped rather than indexed straight, so the reading count and this list
 * cannot fall out of step: if more readings are ever asked for, the guidance
 * repeats instead of running out and handing back undefined.
 */
export function poseHintKey(index: number): PoseHintKey {
  return POSE_HINTS[index % POSE_HINTS.length];
}
