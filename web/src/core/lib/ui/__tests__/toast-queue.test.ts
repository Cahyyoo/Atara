import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_TOASTS,
  TOAST_MS,
  activeToasts,
  addToast,
  createToast,
  dismissToast,
  nextSweepIn,
  resetToastIds,
} from "@/core/lib/ui/toast-queue";

const T0 = 1_000_000;

beforeEach(resetToastIds);

describe("adding", () => {
  it("keeps what arrives, newest last", () => {
    let queue = addToast([], createToast("saved", "success", T0));
    queue = addToast(queue, createToast("removed", "success", T0));

    expect(queue.map((toast) => toast.message)).toEqual(["saved", "removed"]);
  });

  it("gives every notice its own id", () => {
    const first = createToast("a", "success", T0);
    const second = createToast("a", "success", T0);

    // Same words, same moment: without distinct ids one would dismiss both.
    expect(first.id).not.toBe(second.id);
  });

  /**
   * A stack with no ceiling covers the page it is reporting on, and the ones
   * underneath are exactly the ones nobody reads. The newest survives,
   * because it describes what just happened.
   */
  it("caps the stack, dropping the oldest", () => {
    let queue: ReturnType<typeof addToast> = [];
    for (let index = 0; index < MAX_TOASTS + 3; index += 1) {
      queue = addToast(queue, createToast(`notice ${index}`, "success", T0));
    }

    expect(queue).toHaveLength(MAX_TOASTS);
    expect(queue[0].message).toBe(`notice ${3}`);
    expect(queue[queue.length - 1].message).toBe(`notice ${MAX_TOASTS + 2}`);
  });
});

describe("the same notice arriving twice", () => {
  /**
   * The face step captures by itself, so a refusal is something that happens
   * on a timer rather than on a press -- and "no blink seen" twice in a row
   * used to stack two identical red boxes over the screen. The sentence had
   * already been read; only the covered area doubled.
   */

  it("refreshes the one on screen instead of adding a second", () => {
    const first = addToast([], createToast("No blink seen.", "error", 0));
    const again = addToast(first, createToast("No blink seen.", "error", 1000));

    expect(again).toHaveLength(1);
    expect(again[0].expiresAt).toBe(1000 + TOAST_MS.error);
  });

  it("keeps the original id, so the one being read is not replaced", () => {
    const first = addToast([], createToast("No blink seen.", "error", 0));
    const again = addToast(first, createToast("No blink seen.", "error", 1000));

    expect(again[0].id).toBe(first[0].id);
  });

  it("still shows a different message", () => {
    const first = addToast([], createToast("No blink seen.", "error", 0));
    const second = addToast(first, createToast("No face found.", "error", 0));

    expect(second).toHaveLength(2);
  });

  it("treats the same words in a different tone as different news", () => {
    // "Saved" succeeding and "Saved" failing are not the same event, however
    // alike they read.
    const first = addToast([], createToast("Done.", "success", 0));
    const second = addToast(first, createToast("Done.", "error", 0));

    expect(second).toHaveLength(2);
  });

  it("only compares against the newest", () => {
    // A repeat of something older is a sequence worth seeing in order.
    let queue = addToast([], createToast("First.", "error", 0));
    queue = addToast(queue, createToast("Second.", "error", 0));
    queue = addToast(queue, createToast("First.", "error", 0));

    expect(queue.map((toast) => toast.message)).toEqual(["First.", "Second.", "First."]);
  });
});

describe("leaving", () => {
  it("stays for its full time and then goes", () => {
    const queue = addToast([], createToast("saved", "success", T0));

    expect(activeToasts(queue, T0 + TOAST_MS.success - 1)).toHaveLength(1);
    expect(activeToasts(queue, T0 + TOAST_MS.success)).toHaveLength(0);
  });

  it("can be closed before its time", () => {
    const toast = createToast("saved", "success", T0);
    const queue = addToast([], toast);

    expect(dismissToast(queue, toast.id)).toEqual([]);
  });

  it("ignores a dismissal for something already gone", () => {
    const queue = addToast([], createToast("saved", "success", T0));

    expect(dismissToast(queue, 9999)).toHaveLength(1);
  });

  it("expires each on its own clock, not all together", () => {
    // Two notices a second apart must not leave at the same moment.
    let queue = addToast([], createToast("first", "success", T0));
    queue = addToast(queue, createToast("second", "success", T0 + 1000));

    const midway = T0 + TOAST_MS.success + 500;
    expect(activeToasts(queue, midway).map((toast) => toast.message)).toEqual(["second"]);
  });
});

describe("how long a notice stays", () => {
  /**
   * "Saved" needs a glance. "That face did not match" needs reading, and what
   * it is read for is the decision to try again or go and find an admin.
   */
  it("holds a failure longer than a success", () => {
    expect(TOAST_MS.error).toBeGreaterThan(TOAST_MS.success);
  });

  it("bounds both, so neither can be left on screen", () => {
    for (const ms of Object.values(TOAST_MS)) {
      expect(ms).toBeGreaterThan(1000);
      expect(ms).toBeLessThanOrEqual(10_000);
    }
  });

  it("takes the length from the tone, not from the caller", () => {
    // No caller can forget to ask for the longer one, because none of them
    // gets to ask at all.
    const failure = createToast("no match", "error", T0);
    const success = createToast("saved", "success", T0);

    expect(failure.expiresAt).toBe(T0 + TOAST_MS.error);
    expect(success.expiresAt).toBe(T0 + TOAST_MS.success);
  });
});

describe("the sweep timer", () => {
  it("asks for nothing when there is nothing to sweep", () => {
    expect(nextSweepIn([], T0)).toBeNull();
  });

  it("wakes at the soonest expiry, not the latest", () => {
    let queue = addToast([], createToast("first", "success", T0));
    queue = addToast(queue, createToast("second", "success", T0 + 2000));

    // One timer for the whole queue: waking for the last one would leave the
    // first on screen well past its time.
    expect(nextSweepIn(queue, T0)).toBe(TOAST_MS.success);
  });

  it("never asks for a negative delay", () => {
    const queue = addToast([], createToast("first", "success", T0));

    expect(nextSweepIn(queue, T0 + TOAST_MS.success + 5000)).toBe(0);
  });
});

describe("what the toaster is allowed to import", () => {
  /**
   * Not motion. The login page is its own entry, so a MotionProvider there
   * ships a second copy of the library — 147.5KB, measured when the sign-in
   * error was moved to CSS for exactly this reason. These notices appear on
   * login, so the same rule binds them, and nothing about breaking it would
   * be visible: the notices would still animate, and the bundle would quietly
   * grow by more than the whole rest of the app used to weigh.
   */
  it("animates with CSS, not with motion", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "src", "core", "components", "ui", "toast.tsx"),
      "utf8"
    );

    expect(source).not.toContain("motion/react");
    // tw-animate-css classes instead, which the reduced-motion block covers.
    expect(source).toContain("animate-in");
  });
});
