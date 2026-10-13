import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BURST_FRAMES, BURST_INTERVAL_MS } from "@/core/lib/face/face-client";
import { MAX_BURST_FRAMES } from "@/core/lib/face/face-burst";

/**
 * What the browser half is allowed to be, now that dlib does the looking.
 *
 * This file used to pin the cost of a capture loop that ran a 6.2MB
 * recogniser on every frame. That loop is gone, and so is the recogniser,
 * and the cheapest way for either to come back is one import. Source-level,
 * because the thing being guarded is structural: there is no camera here to
 * time, but there is a file to read.
 */

const SOURCE = readFileSync(join(process.cwd(), "src", "core", "lib", "face", "face-client.ts"), "utf8");

describe("the browser half", () => {
  it("does not import face-api or tfjs", () => {
    // The whole saving. 6.7MB of weights and a backend that may or may not
    // have been using the GPU, both gone. If either returns, so does the
    // download on every cold sign-in.
    expect(SOURCE).not.toMatch(/@vladmandic\/face-api|@tensorflow/);
  });

  it("judges nothing", () => {
    // Every rule moved to the server so that the machine being checked is
    // not the one doing the checking. A threshold appearing here again is a
    // rule that a browser with the developer tools open can delete.
    expect(SOURCE).not.toContain("assessFrame(");
    expect(SOURCE).not.toContain("sawBlink(");
    expect(SOURCE).not.toContain("eyesAreClosed(");
    expect(SOURCE).not.toContain("MIN_DETECTION_SCORE");
  });

  it("still asks whether the camera is blank before uploading", () => {
    // No model needed for this one, and answering it here saves sending a
    // burst of black frames to be told they were black.
    expect(SOURCE).toContain("if (isCameraBlank(video))");
  });

  it("waits for the video to have a picture before grabbing frames", () => {
    // play() resolving does not mean a frame exists, and a burst of nothing
    // arrives at the service as "no face found".
    expect(SOURCE).toContain("await waitForFrames(video)");
  });

  it("sleeps only what is left of the interval", () => {
    // A flat sleep on top of the work made a slow machine pay twice, and
    // stretched the burst past the window somebody was asked to blink in.
    expect(SOURCE).toContain("BURST_INTERVAL_MS - (Date.now() - started)");
    expect(SOURCE).toContain("if (remaining > 0)");
  });

  it("allocates one scratch canvas rather than one per frame", () => {
    const grabs = [...SOURCE.matchAll(/document\.createElement\("canvas"\)/g)];
    expect(grabs).toHaveLength(1);
  });
});

describe("the burst", () => {
  it("is sampled closely enough to land inside a blink", () => {
    // A blink lasts roughly 100-150ms. A gap wider than that can sample
    // either side of one and never see it closed.
    expect(BURST_INTERVAL_MS).toBeLessThanOrEqual(150);
  });

  it("spans long enough to ask for a blink and get one", () => {
    expect(BURST_FRAMES * BURST_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });

  it("never sends more frames than the service will take", () => {
    // MAX_FRAMES in face/app/main.py is 16. A burst over that is refused
    // after the upload, which is the worst moment to find out.
    expect(BURST_FRAMES).toBeLessThanOrEqual(MAX_BURST_FRAMES);
  });
});
