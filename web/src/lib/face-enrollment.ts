import { euclideanDistance, MATCH_THRESHOLD } from "@/lib/face-match";

/**
 * Whether a new reading belongs in an enrolment that is already under way.
 *
 * Two questions, and the first is a security one rather than a quality one.
 *
 * Nothing used to check that the five readings were of the same person. If
 * somebody walked through the shot on the third one, the account quietly held
 * two faces and either of them could sign in. No error, no warning, and the
 * enrolment would look complete.
 */

/**
 * How far a reading may sit from the ones already taken and still be the same
 * person. The same number sign-in matches against, because it is the same
 * question: a reading that would not open this account should not be enrolled
 * into it either.
 */
export const SAME_PERSON_DISTANCE = MATCH_THRESHOLD;

/**
 * How close two readings may be before one of them is pointless.
 *
 * Deliberately very loose. Five photographs of one angle recognise one angle,
 * which is the whole reason for taking five — but a threshold set too high
 * makes enrolment impossible, and an enrolment nobody can finish is a worse
 * failure than one with a redundant frame in it. This only refuses frames that
 * are all but identical.
 */
export const DISTINCT_ENOUGH_DISTANCE = 0.1;

/**
 * Why a reading was refused. A list for the same reason as QUALITY_REASONS:
 * these are shown through `t(reason)`, which no scan of source text can see.
 */
export const READING_REASONS = ["enrollDifferentPerson", "enrollTooSimilar"] as const;

export type ReadingReason = (typeof READING_REASONS)[number];

export type ReadingVerdict = { ok: true } | { ok: false; reason: ReadingReason };

/**
 * @param candidate the reading just taken
 * @param existing  readings already accepted for this enrolment
 */
export function assessReading(
  candidate: Float32Array,
  existing: Float32Array[]
): ReadingVerdict {
  // The first reading has nothing to be compared against; it becomes the
  // anchor the rest are measured from.
  if (existing.length === 0) return { ok: true };

  const distances = existing.map((reading) => euclideanDistance(candidate, reading));

  // Against every previous reading, not the nearest. Somebody else in the
  // frame is far from all of them; being close to one is not enough, or a
  // second person could be admitted by resembling a single bad reading.
  if (distances.some((distance) => distance > SAME_PERSON_DISTANCE)) {
    return { ok: false, reason: "enrollDifferentPerson" };
  }

  if (distances.some((distance) => distance < DISTINCT_ENOUGH_DISTANCE)) {
    return { ok: false, reason: "enrollTooSimilar" };
  }

  return { ok: true };
}
