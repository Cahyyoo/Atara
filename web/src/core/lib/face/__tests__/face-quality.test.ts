import { describe, expect, it } from "vitest";
import {
  GUIDE,
  MAX_CENTRE_OFFSET,
  MAX_FACE_WIDTH,
  MIN_DETECTION_SCORE,
  MIN_FACE_LUMINANCE,
  MIN_FACE_WIDTH,
  assessFrame,
  dominantReason,
  type FrameMeasurement,
} from "@/core/lib/face/face-quality";

/** A frame that passes everything, so each test can spoil one thing. */
function goodFrame(overrides: Partial<FrameMeasurement> = {}): FrameMeasurement {
  return { score: 0.9, width: 0.5, centreX: 0.5, centreY: 0.5, luminance: 120, ...overrides };
}

describe("assessFrame", () => {
  it("accepts a well-placed, well-lit face", () => {
    expect(assessFrame(goodFrame())).toEqual({ ok: true });
  });

  it("refuses a detection it is not confident in", () => {
    expect(assessFrame(goodFrame({ score: MIN_DETECTION_SCORE - 0.01 }))).toEqual({
      ok: false,
      reason: "qualityUnsure",
    });
    expect(assessFrame(goodFrame({ score: MIN_DETECTION_SCORE })).ok).toBe(true);
  });

  it("refuses a face too far away to describe", () => {
    expect(assessFrame(goodFrame({ width: MIN_FACE_WIDTH - 0.01 })).ok).toBe(false);
    expect(assessFrame(goodFrame({ width: MIN_FACE_WIDTH })).ok).toBe(true);
  });

  it("refuses a face close enough to be cropped", () => {
    expect(assessFrame(goodFrame({ width: MAX_FACE_WIDTH + 0.01 })).ok).toBe(false);
    expect(assessFrame(goodFrame({ width: MAX_FACE_WIDTH })).ok).toBe(true);
  });

  it("refuses a face out at the edge, in either direction", () => {
    // Measured as a distance, so drifting on both axes at once counts even
    // when neither alone would.
    expect(assessFrame(goodFrame({ centreX: 0.5 + MAX_CENTRE_OFFSET + 0.01 })).ok).toBe(false);
    expect(assessFrame(goodFrame({ centreY: 0.5 - MAX_CENTRE_OFFSET - 0.01 })).ok).toBe(false);
    expect(assessFrame(goodFrame({ centreX: 0.7, centreY: 0.7 })).ok).toBe(false);
  });

  it("refuses a face too dark to have features", () => {
    expect(assessFrame(goodFrame({ luminance: MIN_FACE_LUMINANCE - 1 })).ok).toBe(false);
    expect(assessFrame(goodFrame({ luminance: MIN_FACE_LUMINANCE })).ok).toBe(true);
  });

  /**
   * Every other measurement is taken from a box that may not be a face at
   * all, so a low score has to be reported before anything derived from it.
   */
  it("reports an unsure detection ahead of anything measured from its box", () => {
    const rubbish = goodFrame({ score: 0.1, width: 0.05, centreX: 0.95, luminance: 2 });

    expect(assessFrame(rubbish)).toEqual({ ok: false, reason: "qualityUnsure" });
  });
});

describe("dominantReason", () => {
  it("reports the most common refusal, not the last", () => {
    // The final frame is whichever moment the loop stopped on — a lowered
    // head, a hand passing through. Reporting it sends somebody to fix
    // something that was true for an instant.
    const run = ["qualityTooFar", "qualityTooFar", "qualityTooFar", "qualityTooDark"] as const;

    expect(dominantReason([...run])).toBe("qualityTooFar");
  });

  it("has nothing to report when nothing was refused", () => {
    expect(dominantReason([])).toBeNull();
  });

  it("breaks a tie towards the one seen first", () => {
    // Which is the earliest in the order somebody would fix them.
    expect(dominantReason(["qualityTooFar", "qualityTooDark"])).toBe("qualityTooFar");
  });
});

describe("the guide", () => {
  /**
   * The pairing this file exists for. A guide drawn from its own numbers would
   * eventually tell somebody to stand where the checker refuses them, and that
   * is worse than drawing no guide at all — it would look like the app was
   * lying rather than that they were mispositioned.
   */
  it("sits inside the limits the checker enforces", () => {
    expect(GUIDE.width).toBeGreaterThan(MIN_FACE_WIDTH);
    expect(GUIDE.width).toBeLessThan(MAX_FACE_WIDTH);
  });

  it("accepts a face that exactly fills it", () => {
    expect(assessFrame(goodFrame({ width: GUIDE.width })).ok).toBe(true);
  });

  it("is taller than it is wide, like a head", () => {
    // An oval as wide as it is tall invites filling it sideways, which is
    // then refused for being too close.
    expect(GUIDE.height).toBeGreaterThan(GUIDE.width);
  });
});
