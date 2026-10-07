import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";

/**
 * The sign-in page has to fit on the screen it is shown on.
 *
 * It stopped fitting by accumulation rather than by any one change: a camera,
 * then a line of measurements under it, then a second escape route once the
 * authenticator arrived. Each was reasonable; together they pushed the last
 * button below the fold, which is where the screenshot found it.
 *
 * None of this is catchable by types or by a rendering test at one fixed size
 * -- a layout that overflows still renders. So the few structural decisions
 * that keep it fitting are pinned here, with the reason each one matters.
 */

/**
 * The file with its comments taken out.
 *
 * A first attempt read the raw source and failed on the word "min-h-screen"
 * appearing in the comment explaining why it is no longer used. A check that
 * trips over its own explanation teaches people to stop writing explanations,
 * so these read the code instead.
 */
function code(...parts: string[]): string {
  return readFileSync(join(process.cwd(), "src", ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const PAGE = code("app", "login", "page.tsx");
const CAMERA = code("components", "face", "face-camera.tsx");
const STEP = code("components", "face", "face-step.tsx");
const ENROL = code("components", "face", "face-enroll-dialog.tsx");

describe("the page is a box, not a column", () => {
  it("is bounded by the viewport", () => {
    // min-h-screen grows to fit its content, which is the opposite of what
    // this page needs.
    expect(PAGE).toContain("h-dvh");
    expect(PAGE).not.toContain("min-h-screen");
  });

  it("uses dvh, not vh", () => {
    // A phone's address bar moves and takes the viewport with it. vh does not
    // notice; dvh does.
    expect(PAGE).not.toMatch(/h-\[?\d*vh/);
  });

  it("gives the card a child that can shrink", () => {
    // A flex item only gives up space if it is allowed to. Without min-h-0
    // the card stays as tall as its content and the overflow goes off the
    // bottom of the screen instead of scrolling -- the same mistake the
    // enrolment dialog made, for the same reason.
    expect(PAGE).toContain("min-h-0");
    expect(PAGE).toContain("overflow-y-auto");
  });
});

describe("the camera gives up space first", () => {
  it("is capped by height", () => {
    // What makes a short window lose picture rather than lose the controls
    // underneath it.
    expect(CAMERA).toContain("max-h-[38dvh]");
  });

  it("is still four by three", () => {
    /**
     * Load-bearing, not cosmetic.
     *
     * FaceGuide draws its oval from fractions of the video frame -- the same
     * fractions face-quality.ts refuses on. A box with any other ratio gets
     * object-cover cropping underneath it, and the oval starts marking a spot
     * the checker will then reject. The failure is silent and it looks like
     * the app is broken rather than like somebody is standing wrong.
     */
    expect(CAMERA).toContain("aspect-[4/3]");
  });
});

describe("the measurements", () => {
  it("are gone from both page flows", () => {
    // They cost a block of height on every sign-in to say the same reassuring
    // thing each time it worked.
    for (const source of [STEP, ENROL]) {
      expect(source).not.toContain("font-mono text-[11px]");
    }
  });

  it("are not handed to the camera either", () => {
    /**
     * They were on the overlay for a day. That was still the wrong reader:
     * "best score 0.93 (floor 0.50)" describes the checker, and the person
     * looking at it is trying to sign in.
     */
    expect(CAMERA).not.toContain("details");
    for (const source of [STEP, ENROL]) {
      expect(source).not.toContain("details={");
    }
  });

  it("go to the console, so a report can still be diagnosed", () => {
    // Dropped from the screen, not from the build. The one case that needs
    // them is somebody saying their face is never detected.
    for (const source of [STEP, ENROL]) {
      expect(source).toContain('console.debug("[face]"');
    }
  });

  it("are still formatted in one place", () => {
    // formatDiagnostics stays the only thing that decides how a reading
    // reads; only where it appears has changed.
    for (const source of [STEP, ENROL]) {
      expect(source).toContain("formatDiagnostics(");
    }
  });
});

describe("the two ways out", () => {
  it("do not share a row", () => {
    /**
     * They did for a day, to save height, and the saving cost more than it
     * was worth: "Back, start again from the password" is thirty-five
     * characters, it overflowed a half-width button, and the card grew a
     * horizontal scrollbar with the label cut through the middle of a word.
     *
     * Two buttons on a row break again the moment a language needs longer
     * words. One full-width action and one quiet link do not.
     */
    const buttons = STEP.slice(STEP.indexOf("useAnotherMethod"));
    expect(buttons).not.toContain("flex-1");
  });

  it("keep the label short enough to fit in every language", () => {
    // The actual cause, pinned as a number rather than as a layout rule.
    for (const messages of [en, id]) {
      expect(messages.face.backToPassword.length).toBeLessThan(25);
    }
  });

  it("both survive", () => {
    // Saving height by removing an escape route would be the wrong trade:
    // one is for a camera that will not cooperate, the other for starting
    // over entirely.
    expect(STEP).toContain("useAnotherMethod");
    expect(STEP).toContain('t("backToPassword")');
  });
});
