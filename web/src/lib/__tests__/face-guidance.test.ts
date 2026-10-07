import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The things a confused operator would have asked about.
 *
 * All of these were silent: a 6.7MB download behind a button that only said
 * "Checking…", a disabled button with no reason, a two-second capture with no
 * instruction, and an opening line describing a step that had already passed.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

const CAMERA = read("components", "face", "face-camera.tsx");
const STEP = read("components", "face", "face-step.tsx");
const LOGIN_PAGE = read("app", "login", "page.tsx");

describe("the live guide", () => {
  it("asks the server where the face is while the camera is idle", () => {
    // What lets the oval turn green before Verify is pressed, rather than
    // the app only explaining itself afterwards. The weights this used to
    // preload are gone; the preview is what took their place.
    expect(CAMERA).toContain('fetch("/api/face/preview"');
    expect(CAMERA).toContain("grabPreviewFrame(videoRef.current)");
  });

  it("stops asking during a capture", () => {
    // The burst is what is being judged then; a preview racing it would
    // only compete for the service.
    expect(CAMERA).toContain("if (!isOn || isBusy || halted) return;");
  });

  it("never has two previews in flight", () => {
    // A slow answer must not pile up behind itself.
    expect(CAMERA).toContain("if (inFlight ||");
  });

  it("is not green on silence", () => {
    // The oval turns green on a passing preview, not on the absence of a
    // failing one.
    expect(CAMERA).toContain("hasPreview && hint === null");
  });

  it("asks no faster than the preview route will answer", () => {
    // A 429 stops the guide with "busy". If the route's limit ever sits below
    // the guide's own rate, somebody sitting still in front of the camera is
    // told the service is busy by the service's own pacing.
    const PREVIEW_ROUTE = read("app", "api", "face", "preview", "route.ts");
    const interval = Number(CAMERA.match(/const PREVIEW_INTERVAL_MS = (\d+);/)?.[1]);
    const [, limit, windowMs] =
      PREVIEW_ROUTE.match(/PREVIEW_LIMIT = \{ limit: (\d+), windowMs: (\d+) \}/) ?? [];

    expect(interval).toBeGreaterThan(0);
    const asked = Number(windowMs) / interval;
    expect(Number(limit)).toBeGreaterThan(asked);
  });

  it("says the service is down once, then stops", () => {
    // Repeating it several times a second would be the same message in a
    // loop. Every exit goes through one stop() that both says why and ends
    // the loop, so pinning the helper pins every caller of it.
    expect(CAMERA).toContain('stop(t("serviceDown"))');
    expect(CAMERA).toMatch(/const stop = \(message: string\) => \{\s*setError\(message\);\s*cancelled = true;/);
  });
});

describe("the automatic capture", () => {
  /**
   * There used to be a button -- "Verify", or "Take reading 3 of 5" -- which
   * asked somebody to hold a pose steady with one hand and press with the
   * other, and to judge for themselves whether the moment was any good. The
   * preview already knows. These pin the parts of firing by itself that would
   * be wrong in ways nothing else would catch.
   */

  it("is not triggered by a button", () => {
    // The whole change. A capture button reappearing here means somebody is
    // being asked again to decide when their own face is framed well enough.
    expect(CAMERA).not.toContain("onClick={run}");
  });

  it("fires only after several passing previews in a row", () => {
    // One lucky frame is a face passing through the shot, not somebody
    // sitting in front of the camera.
    expect(CAMERA).toContain("next >= ARM_TICKS");
    expect(CAMERA).toContain("void run()");
  });

  it("starts the count again the moment a preview fails", () => {
    // Counting through a wobble would mean capturing on the strength of
    // frames that had already stopped being true.
    expect(CAMERA).toContain("setArmed(0)");
  });

  it("counts down where it can be read without looking away", () => {
    // A camera that fires without warning reads as a glitch, and the count
    // doubles as the cue to blink -- so it has to be on the picture, not
    // beside it.
    expect(CAMERA).toContain("ARM_TICKS - armed");
    expect(CAMERA).toContain('t("autoIn"');
  });

  it("waits before counting again after a capture", () => {
    // Enrolment asks for a different pose each time. Without the pause the
    // next capture begins while somebody is still reading which pose to
    // strike, and is refused as too similar to the last -- a confusing way
    // to be told to move.
    expect(CAMERA).toContain("readyAt.current = Date.now() + COOLDOWN_MS");
    expect(CAMERA).toContain("Date.now() < readyAt.current");
  });

  it("does not count while a capture is already running", () => {
    expect(CAMERA).toContain("if (!isOn || isBusy || halted) return;");
  });
});

describe("the capture", () => {
  it("says what to do while it is happening", () => {
    // The instruction is in the heading too, but that was read before the
    // camera was even on, and the burst is over in a second and a half.
    expect(CAMERA).toContain('t("blinkNow")');
  });
});

describe("the step", () => {
  it("says which step it is and what it is", () => {
    expect(STEP).toContain('t("stepOf"');
    expect(STEP).toContain('t("title")');
  });

  it("names the back button for what it does", () => {
    // No session exists yet, so it really does send you back to the password.
    // "Cancel" invites being pressed as "try again".
    expect(STEP).toContain('t("backToPassword")');
    expect(STEP).not.toContain('tCommon("cancel")');
  });
});

describe("the opening line", () => {
  it("is no longer rendered by the page", () => {
    // It lived on the page and stayed put when the form moved to the face
    // step, so "sign in to access the dashboard" sat above a camera belonging
    // to somebody whose password had already been accepted.
    expect(LOGIN_PAGE).not.toContain('{t("subtitle")}');
  });
});
