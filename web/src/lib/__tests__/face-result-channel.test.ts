import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every verification result is reported in one place.
 *
 * It was not. Some failures were thrown and caught by FaceCamera, which showed
 * them above the Verify button; others were stored in the caller's state and
 * shown below the camera. Where a message appeared depended on why it failed,
 * and "that face did not match" — the one that matters most — landed furthest
 * from the button just pressed.
 *
 * Nothing about that is a type error or a crash, so it is pinned here.
 */

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), "src", "components", "face", ...parts), "utf8");

const STEP = read("face-step.tsx");
const ENROL = read("face-enroll-dialog.tsx");
const CAMERA = read("face-camera.tsx");

describe("the sign-in step", () => {
  /**
   * Two channels now, chosen by one rule.
   *
   * Everything used to be a notification, and the camera fires on a timer, so
   * "no blink seen" arrived twice in the corner of the screen while the person
   * it was for stared at the lens in the middle. A refusal the camera is about
   * to retry belongs on the picture; only something that ends the sitting is
   * worth looking away for.
   */

  it("sends a retryable refusal to the picture, not to a notification", () => {
    expect(STEP).toContain("interpretRefusal(result)");
    expect(STEP).toContain('verdict: refusal.canRetry ? "retry" : "halt"');
    expect(STEP).toContain("notice: t(refusal.messageKey)");
    // The old channel for these, and the bug in the screenshot.
    expect(STEP).not.toContain('toast(t(refusal.messageKey), "error")');
  });

  it("notifies for the outcomes that end the sitting", () => {
    expect(STEP).toContain('toast(t("verified"))');
    expect(STEP).toContain('toast(result.error ?? tCommon("networkError"), "error")');
  });

  it("stops the camera on anything that costs an attempt", () => {
    /**
     * The one that matters. A face compared and refused spends one of five
     * tries before the account locks for fifteen minutes, and a camera on a
     * timer would spend all five in about half a minute with nobody pressing
     * anything. Every path out of here that is not a plain retry has to halt.
     */
    const verdicts = [...STEP.matchAll(/verdict: "(retry|halt)"/g)].map((match) => match[1]);
    expect(verdicts).toContain("halt");
    expect(verdicts.filter((verdict) => verdict === "retry")).toHaveLength(0);
  });

  it("keeps no second place for a result to appear", () => {
    expect(STEP).not.toContain("InlineNotice");
  });

  it("marks failures as failures, so they are not shown as successes", () => {
    // toast() defaults to "success"; a failure that forgot its tone would be
    // announced with a tick beside it.
    // [\s\S] rather than the dotAll flag: tsc refuses `s` at this target,
    // and vitest running it anyway is exactly how that slips past.
    const calls = [...STEP.matchAll(/toast\(([\s\S]*?)\);/g)].map((match) => match[1]);
    const failures = calls.filter((call) => /networkError|result\.error/.test(call));

    expect(failures.length).toBeGreaterThan(0);
    for (const call of failures) {
      expect(call).toContain('"error"');
    }
  });
});

describe("the enrolment dialog", () => {
  it("does the same, so the two cannot drift apart", () => {
    expect(ENROL).not.toContain("InlineNotice");
    expect(ENROL).toContain("interpretRefusal(result)");
    expect(ENROL).toContain('verdict: refusal.canRetry ? "retry" : "halt"');
    expect(ENROL).not.toContain('toast(t(refusal.messageKey), "error")');
  });

  it("puts a reading refused for its own sake on the picture too", () => {
    // "Turn a little further" and "that is somebody else" are instructions,
    // answered by moving -- so they belong where somebody is already looking,
    // and they are worth trying again.
    expect(ENROL).toContain('return { verdict: "retry", notice: t(verdict.reason) };');
  });
});

describe("the camera component", () => {
  it("hands a reading's outcome to its caller rather than showing it", () => {
    // The catch that used to swallow it is gone; what remains is the camera
    // refusing to start, which blocks rather than informs.
    expect(CAMERA).not.toMatch(/catch \(caught\) \{\s*setError\(caught instanceof Error/);
  });

  it("still shows the three reasons the camera itself will not run", () => {
    for (const blocker of ["cameraInsecure", "cameraMissing", "cameraDenied"]) {
      expect(CAMERA).toContain(`t("${blocker}")`);
    }
    expect(CAMERA).toContain("InlineNotice");
  });
});
