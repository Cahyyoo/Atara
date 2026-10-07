import { describe, expect, it } from "vitest";
import {
  BLINK_THRESHOLD,
  eyeAspectRatio,
  eyesAreClosed,
  sawBlink,
  type Point,
} from "@/lib/face-liveness";

/**
 * Six landmarks around an eye, corner to corner, at a given openness.
 * Width is fixed at 1 so the ratio is whatever `height` says.
 */
function eye(height: number): Point[] {
  return [
    { x: 0, y: 0 }, // outer corner
    { x: 0.3, y: -height / 2 }, // upper lid
    { x: 0.7, y: -height / 2 },
    { x: 1, y: 0 }, // inner corner
    { x: 0.7, y: height / 2 }, // lower lid
    { x: 0.3, y: height / 2 },
  ];
}

describe("eyeAspectRatio", () => {
  it("reads a wide-open eye as tall relative to its width", () => {
    expect(eyeAspectRatio(eye(0.32))).toBeCloseTo(0.32, 5);
  });

  it("reads a closed eye as near flat", () => {
    expect(eyeAspectRatio(eye(0.05))).toBeCloseTo(0.05, 5);
  });

  it("refuses a landmark set that is not an eye", () => {
    expect(() => eyeAspectRatio(eye(0.3).slice(0, 4))).toThrow(/6 landmarks/);
  });

  it("treats collapsed landmarks as closed rather than dividing by zero", () => {
    // A detector that loses the eye returns points on top of each other.
    // Reporting "closed" refuses the frame; NaN or Infinity would sail past
    // the threshold comparison and read as open.
    const collapsed: Point[] = Array.from({ length: 6 }, () => ({ x: 5, y: 5 }));

    expect(eyeAspectRatio(collapsed)).toBe(0);
    expect(Number.isFinite(eyeAspectRatio(collapsed))).toBe(true);
  });
});

describe("eyesAreClosed", () => {
  it("is decided at the threshold", () => {
    const openish = eye(BLINK_THRESHOLD + 0.02);
    const shut = eye(BLINK_THRESHOLD - 0.02);

    expect(eyesAreClosed(openish, openish)).toBe(false);
    expect(eyesAreClosed(shut, shut)).toBe(true);
  });

  it("needs both eyes closed, so one lost eye is not a blink", () => {
    // Safety glasses catching the light lose an eye to the detector all the
    // time, and a lost eye reads as 0. Averaging would put 0 and a wide-open
    // 0.34 under the threshold and call it a blink, handing away the one
    // thing this check is for.
    expect(eyesAreClosed(eye(0.0), eye(0.34))).toBe(false);
    expect(eyesAreClosed(eye(0.03), eye(0.34))).toBe(false);
  });

  it("still reads a real blink, where both eyes close together", () => {
    expect(eyesAreClosed(eye(0.05), eye(0.06))).toBe(true);
  });
});

describe("sawBlink", () => {
  it("accepts a closing followed by an opening", () => {
    expect(sawBlink([false, false, true, true, false])).toBe(true);
  });

  it("refuses a run of frames where the eyes never closed", () => {
    // A photograph held to the camera, in the ordinary case.
    expect(sawBlink([false, false, false, false])).toBe(false);
  });

  /**
   * The case a naive check gets wrong: a photograph of somebody mid-blink, or
   * a face that arrived with its eyes already shut. Closed frames alone are
   * not a blink — the eyes have to open again.
   */
  it("refuses eyes that were closed the whole time", () => {
    expect(sawBlink([true, true, true])).toBe(false);
  });

  it("refuses an empty run rather than treating it as a pass", () => {
    expect(sawBlink([])).toBe(false);
  });

  it("accepts a blink that starts on the first frame", () => {
    expect(sawBlink([true, false, false])).toBe(true);
  });
});
