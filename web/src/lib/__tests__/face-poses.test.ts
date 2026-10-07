import { describe, expect, it } from "vitest";
import { POSE_HINTS, poseHintKey } from "@/lib/face-poses";

/**
 * Five readings only earn their keep if they are five different readings.
 * Nothing on screen used to say what each one was for, so an admin taking
 * them had no reason to move between shots — and five photographs of one
 * angle recognise one angle.
 */
describe("poseHintKey", () => {
  it("gives a different instruction for each of the five", () => {
    const hints = [0, 1, 2, 3, 4].map(poseHintKey);

    expect(new Set(hints).size).toBe(5);
  });

  it("starts and ends looking straight ahead", () => {
    // The first is the easiest to get right, and the last returns to the
    // angle the camera will actually see at sign-in.
    expect(poseHintKey(0)).toBe("poseFront");
    expect(poseHintKey(4)).toBe("poseFrontAgain");
  });

  it("repeats rather than running out if more readings are ever asked for", () => {
    // REQUIRED_FRAMES and this list live in different files. Indexing straight
    // past the end would hand back undefined and render a blank instruction,
    // which reads as a broken step rather than a missing one.
    expect(poseHintKey(5)).toBe(poseHintKey(0));
    expect(poseHintKey(12)).toBe(poseHintKey(2));
    for (const index of [0, 5, 99, 1000]) {
      expect(POSE_HINTS).toContain(poseHintKey(index));
    }
  });
});
