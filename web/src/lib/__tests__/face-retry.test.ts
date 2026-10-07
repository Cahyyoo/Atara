import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { interpretRefusal } from "@/lib/face-client";

/**
 * The brake on a camera that fires by itself.
 *
 * Auto-capture removed the button, and with it the thing a button quietly
 * provided: an attempt only happened because somebody decided it should. A
 * timer does not decide, it repeats -- and one of the failures it can repeat
 * costs an account.
 *
 * A face compared and refused spends one of five tries before the account
 * locks for fifteen minutes. One cycle is roughly five and a half seconds
 * (2.5s cooldown, 0.9s arming, 1.4s burst, ~1s round trip), so five of them
 * arrive in under half a minute with nobody touching anything. None of that
 * is a type error, a crash or a failing request: the account simply locks and
 * the person sitting in front of the camera has no idea why.
 */

const CAMERA = readFileSync(
  join(process.cwd(), "src", "components", "face", "face-camera.tsx"),
  "utf8"
);

describe("which refusals may repeat", () => {
  /**
   * Decided by one question: did the attempt cost anything? The server
   * refuses these before it compares anything, so nothing was spent.
   */
  it("lets a free refusal repeat", () => {
    for (const code of ["no-face", "poor-quality", "not-alive"]) {
      expect(interpretRefusal({ code })?.canRetry, code).toBe(true);
    }
  });

  it("does not repeat a refusal that nothing will change", () => {
    // Four seconds from now the service is still down.
    expect(interpretRefusal({ code: "service-down" })?.canRetry).toBe(false);
  });

  it("carries the measurements through either way", () => {
    const diagnostics = { bestScore: 0.42 } as never;
    expect(interpretRefusal({ code: "no-face", details: { diagnostics } })?.diagnostics).toBe(
      diagnostics
    );
  });

  it("has nothing to say about a code it does not know", () => {
    // A mismatch arrives with no refusal code, and that is what sends the
    // sign-in step down its own path rather than into a retry.
    expect(interpretRefusal({ code: undefined })).toBeNull();
    expect(interpretRefusal({ code: "something-new" })).toBeNull();
  });
});

describe("the camera's brake", () => {
  it("stops arming once halted", () => {
    // Without this the preview keeps counting behind the Try again button and
    // fires the moment the count reaches zero, which is the halt in name only.
    expect(CAMERA).toContain("if (!isOn || isBusy || halted) return;");
  });

  it("halts on a verdict of halt", () => {
    expect(CAMERA).toContain('if (outcome.verdict === "halt")');
    expect(CAMERA).toContain("setHalted(true)");
  });

  it("bounds the free retries as well", () => {
    /**
     * Free to the server is not free to a person. A burst is about 400KB, and
     * somebody who cannot blink on cue would otherwise sit in a loop that
     * never ends and never explains itself.
     */
    expect(CAMERA).toContain("MAX_FREE_RETRIES");
    expect(CAMERA).toContain("freeRetries.current >= MAX_FREE_RETRIES");
  });

  it("counts consecutive failures, not lifetime ones", () => {
    // A single bad frame in a long sitting must not spend the allowance for
    // the rest of it.
    expect(CAMERA).toContain("freeRetries.current = 0");
  });

  it("only restarts when a person asks", () => {
    // The property the button used to provide, restored explicitly.
    expect(CAMERA).toContain("function resume()");
    expect(CAMERA).toContain("onClick={resume}");
    expect(CAMERA).toContain("setHalted(false)");
  });

  it("gives the countdown a cooldown after resuming", () => {
    // Otherwise pressing Try again captures almost immediately, before
    // anybody has settled back in front of the lens.
    const resume = CAMERA.slice(CAMERA.indexOf("function resume()"));
    expect(resume.slice(0, 400)).toContain("readyAt.current = Date.now() + COOLDOWN_MS");
  });
});

describe("where a refusal is said", () => {
  it("puts it on the picture", () => {
    // Somebody being told to blink is looking at the lens. The notification
    // stack is the furthest point on the screen from it, and it was arriving
    // there twice.
    expect(CAMERA).toContain("setNotice(outcome.notice ?? null)");
    // The caption falls through to the notice. Matched without the
    // surrounding whitespace: the first version pinned prettier's formatting
    // and broke on a file with CRLF endings.
    expect(CAMERA.replace(/\s+/g, " ")).toContain(": notice ? notice");
  });

  it("clears it when the next attempt starts", () => {
    // A stale reason under a running countdown would describe the attempt
    // before last.
    expect(CAMERA).toContain("setNotice(null)");
  });

  it("does not let it outrank what is happening right now", () => {
    // The order in the caption: what the camera is doing, then what just
    // failed, then the count, then the live framing fault.
    const busy = CAMERA.indexOf("const status = isBusy");
    const notice = CAMERA.indexOf("? notice", busy);
    const armed = CAMERA.indexOf('t("autoIn"', busy);

    expect(busy).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(busy);
    expect(armed).toBeGreaterThan(notice);
  });
});
