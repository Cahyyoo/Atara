import { describe, expect, it } from "vitest";
import { judgeBurst } from "@/lib/face-reading";
import type { FrameReading, ServiceResult } from "@/lib/face-service";
import { MIN_DETECTION_SCORE, MIN_FACE_WIDTH, MIN_FACE_LUMINANCE } from "@/lib/face-quality";

/**
 * The decision, tested against numbers.
 *
 * Everything here used to happen inside a capture loop with a webcam in it.
 * Now it is a pure function of what dlib reported, which is the whole reason
 * it can be tested at all.
 */

/** An eye as six points, open or shut. Shape matters, position does not. */
function eye(open: boolean): [number, number][] {
  const height = open ? 0.02 : 0.004;
  return [
    [0.40, 0.40],
    [0.41, 0.40 - height],
    [0.43, 0.40 - height],
    [0.44, 0.40],
    [0.43, 0.40 + height],
    [0.41, 0.40 + height],
  ];
}

function frame(overrides: Partial<FrameReading> = {}): FrameReading {
  return {
    detected: true,
    score: 0.9,
    box: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 },
    leftEye: eye(true),
    rightEye: eye(true),
    luminance: 120,
    ...overrides,
  };
}

function nothing(): FrameReading {
  return {
    detected: false,
    score: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
    leftEye: [],
    rightEye: [],
    luminance: 0,
  };
}

function result(frames: FrameReading[], bestFrameIndex: number | null = 0): ServiceResult {
  return {
    frames,
    descriptor: bestFrameIndex === null ? null : new Array(128).fill(0.1),
    bestFrameIndex,
    engine: { detector: "hog", elapsedMs: 800 },
  };
}

describe("a burst that passed", () => {
  it("hands back the descriptor", () => {
    const verdict = judgeBurst(result([frame(), frame()]));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.descriptor).toHaveLength(128);
  });

  it("saw a blink when an eye closed and reopened", () => {
    const frames = [frame(), frame({ leftEye: eye(false), rightEye: eye(false) }), frame()];
    const verdict = judgeBurst(result(frames));
    expect(verdict.ok && verdict.alive).toBe(true);
  });

  it("did not see a blink in a face that never closed its eyes", () => {
    // A photograph held to the camera.
    const verdict = judgeBurst(result([frame(), frame(), frame()]));
    expect(verdict.ok && verdict.alive).toBe(false);
  });

  it("did not see a blink in eyes that closed and stayed closed", () => {
    // Arriving with eyes shut is not a blink; a blink is a closing and an
    // opening, and a photograph of somebody mid-blink has only the first.
    const shut = frame({ leftEye: eye(false), rightEye: eye(false) });
    const verdict = judgeBurst(result([frame(), shut, shut]));
    expect(verdict.ok && verdict.alive).toBe(false);
  });

  it("does not count one lost eye as a blink", () => {
    // The mistake eyesAreClosed exists to refuse: an eye the detector lost
    // reads as 0, and 0 averaged against a wide-open eye still lands under
    // the threshold. Only both closing counts.
    const oneEye = frame({ leftEye: eye(true), rightEye: eye(false) });
    const verdict = judgeBurst(result([frame(), oneEye, frame()]));
    expect(verdict.ok && verdict.alive).toBe(false);
  });
});

describe("a burst with nobody in it", () => {
  it("is refused as no-face, not as poor quality", () => {
    // Opposite advice: "check the lens" rather than "step closer".
    const verdict = judgeBurst(result([nothing(), nothing()], null));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.failure).toBe("no-face");
  });

  it("still reports how many frames were looked at", () => {
    const verdict = judgeBurst(result([nothing(), nothing(), nothing()], null));
    expect(verdict.diagnostics.frames).toBe(3);
    expect(verdict.diagnostics.framesWithDetection).toBe(0);
  });
});

describe("a burst with somebody who was never good enough", () => {
  it("is refused with the reason that was true most often", () => {
    const far = frame({ box: { x: 0.45, y: 0.4, width: MIN_FACE_WIDTH - 0.05, height: 0.15 } });
    const dark = frame({ luminance: MIN_FACE_LUMINANCE - 10 });
    const verdict = judgeBurst(result([far, far, dark], 0));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok && verdict.failure === "poor-quality") {
      expect(verdict.reason).toBe("qualityTooFar");
    }
  });

  it("refuses the descriptor even though dlib produced one", () => {
    /**
     * The frame dlib described is picked by detector score alone, which says
     * nothing about how far away or how dark it was. Without this a burst
     * where every frame was too dim would still hand back a descriptor built
     * from the least dim one.
     */
    const dim = frame({ luminance: MIN_FACE_LUMINANCE - 1 });
    const verdict = judgeBurst(result([dim, dim], 0));
    expect(verdict.ok).toBe(false);
  });

  it("refuses a face the detector was not sure about", () => {
    const unsure = frame({ score: MIN_DETECTION_SCORE - 0.01 });
    const verdict = judgeBurst(result([unsure], 0));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok && verdict.failure === "poor-quality") {
      expect(verdict.reason).toBe("qualityUnsure");
    }
  });

  it("carries the measurements that explain the refusal", () => {
    const verdict = judgeBurst(result([frame({ score: 0.42, box: { x: 0.4, y: 0.3, width: 0.18, height: 0.2 } })], 0));
    expect(verdict.diagnostics.bestScore).toBeCloseTo(0.42);
    expect(verdict.diagnostics.bestWidth).toBeCloseTo(0.18);
    expect(verdict.diagnostics.framesWithDetection).toBe(1);
  });
});

describe("the diagnostics", () => {
  it("record the camera's own dimensions, which only the browser knows", () => {
    const verdict = judgeBurst(result([frame()]), { videoWidth: 640, videoHeight: 480 });
    expect(verdict.diagnostics.videoWidth).toBe(640);
    expect(verdict.diagnostics.videoHeight).toBe(480);
  });

  it("record how long the service took", () => {
    expect(judgeBurst(result([frame()])).diagnostics.elapsedMs).toBe(800);
  });
});
