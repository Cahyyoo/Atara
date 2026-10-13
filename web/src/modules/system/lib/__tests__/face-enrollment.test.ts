import { describe, expect, it } from "vitest";
import {
  DISTINCT_ENOUGH_DISTANCE,
  SAME_PERSON_DISTANCE,
  assessReading,
} from "@/modules/system/lib/face-enrollment";
import { DESCRIPTOR_LENGTH, MATCH_THRESHOLD } from "@/core/lib/face/face-match";

function flat(value: number): Float32Array {
  return new Float32Array(DESCRIPTOR_LENGTH).fill(value);
}

/** A reading a known euclidean distance from another. */
function apart(from: Float32Array, distance: number): Float32Array {
  const moved = Float32Array.from(from);
  moved[0] += distance;
  return moved;
}

const FIRST = flat(0.1);

describe("the first reading", () => {
  it("is accepted, because it is what the rest are measured from", () => {
    expect(assessReading(FIRST, [])).toEqual({ ok: true });
  });
});

describe("somebody else in the frame", () => {
  /**
   * The hole this closes. Nothing used to check the five readings were one
   * person, so a passer-by on the third one left the account holding two
   * faces — and either of them would sign in. No error, nothing to see.
   */
  it("is refused", () => {
    const stranger = apart(FIRST, SAME_PERSON_DISTANCE + 0.2);

    expect(assessReading(stranger, [FIRST])).toEqual({
      ok: false,
      reason: "enrollDifferentPerson",
    });
  });

  it("is refused even when it resembles one earlier reading", () => {
    // Close to the second, far from the first. Checked against every reading
    // rather than the nearest, or a second person could be let in by
    // resembling a single poor frame.
    // These move along one axis, so the distances add: the stranger sits
    // 0.5 from the second reading (inside the limit) and 0.8 from the first
    // (outside it).
    const second = apart(FIRST, 0.3);
    const stranger = apart(second, 0.5);

    expect(assessReading(stranger, [FIRST, second]).ok).toBe(false);
  });

  it("uses the same threshold sign-in matches against", () => {
    // A reading that would not open this account has no business being
    // enrolled into it.
    expect(SAME_PERSON_DISTANCE).toBe(MATCH_THRESHOLD);
  });
});

describe("a reading that adds nothing", () => {
  it("is refused when it is all but identical to one already taken", () => {
    const twin = apart(FIRST, DISTINCT_ENOUGH_DISTANCE / 2);

    expect(assessReading(twin, [FIRST])).toEqual({ ok: false, reason: "enrollTooSimilar" });
  });

  /**
   * The failure that matters more than a redundant frame: a threshold set too
   * high makes enrolment impossible, and an enrolment nobody can finish is far
   * worse than one carrying a similar reading.
   */
  it("leaves ordinary head turns comfortably inside", () => {
    // A quarter-turn of the same face moves the descriptor a long way further
    // than this, and all of these must be accepted.
    for (const distance of [0.15, 0.25, 0.4, 0.55]) {
      expect(assessReading(apart(FIRST, distance), [FIRST]).ok).toBe(true);
    }
  });

  it("stays well clear of the same-person limit", () => {
    // The window between them is where every real enrolment lives; if they
    // ever met, nothing could be enrolled at all.
    expect(DISTINCT_ENOUGH_DISTANCE).toBeLessThan(SAME_PERSON_DISTANCE / 2);
  });
});
