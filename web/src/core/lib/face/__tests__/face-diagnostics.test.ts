import { describe, expect, it } from "vitest";
import { emptyDiagnostics, formatDiagnostics } from "@/core/lib/face/face-diagnostics";
import { MIN_DETECTION_SCORE } from "@/core/lib/face/face-quality";

/**
 * "No face detected" is true and useless. It covers a detector that saw
 * nothing and one that saw a face at 0.42 against a floor of 0.50, and those
 * need opposite fixes: one is the camera or the model, the other is a number
 * in this repository.
 *
 * These numbers are what somebody at the camera reads back, so every part of
 * the line has to be there and has to be unambiguous.
 */
describe("formatDiagnostics", () => {
  const measured = {
    ...emptyDiagnostics(),
    videoWidth: 640,
    videoHeight: 480,
    frames: 24,
    framesWithDetection: 7,
    bestScore: 0.31,
    bestWidth: 0.18,
    luminance: 96.4,
    elapsedMs: 2140,
  };

  it("names the video size, so a zero can be spotted", () => {
    expect(formatDiagnostics(measured)).toContain("video 640x480");
  });

  it("says how many frames saw anything at all", () => {
    // The difference between "the detector never saw a face" and "it saw one
    // and I refused it" lives in this fraction.
    expect(formatDiagnostics(measured)).toContain("7/24 frames with a face");
  });

  it("puts the best score next to the floor it was judged against", () => {
    // A score alone means nothing without the line it had to clear.
    const line = formatDiagnostics(measured);

    expect(line).toContain("best score 0.31");
    expect(line).toContain(`floor ${MIN_DETECTION_SCORE.toFixed(2)}`);
  });

  it("reports the widest the face got, as a percentage", () => {
    expect(formatDiagnostics(measured)).toContain("widest 18%");
  });

  it("reports brightness and how long it took", () => {
    expect(formatDiagnostics(measured)).toContain("brightness 96");
    expect(formatDiagnostics(measured)).toContain("2.1s");
  });

  it("reads as zeros when nothing was measured", () => {
    // A capture that failed before it began must not print NaN at somebody.
    const line = formatDiagnostics(emptyDiagnostics());

    expect(line).not.toContain("NaN");
    expect(line).toContain("video 0x0");
    expect(line).toContain("0/0 frames");
  });
});
