// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useContext } from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MotionConfigContext } from "motion/react";
import { MotionProvider } from "@/components/layout/motion-provider";

/**
 * Motion is a setting, and this app answers it in two halves that do not
 * overlap: a CSS media block for everything that is not a motion component,
 * and MotionConfig for everything that is. Either half alone leaves gaps —
 * without the CSS the popups and transitions keep moving, without MotionConfig
 * the counters and the layout animations do.
 *
 * Both are easy to delete by accident and impossible to notice missing unless
 * you happen to have the setting on, which is why they are pinned here.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

describe("prefers-reduced-motion, the CSS half", () => {
  it("has a reduce block at all", () => {
    expect(CSS).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("reaches pseudo-elements too, not only real ones", () => {
    const block = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("*::before");
    expect(block).toContain("*::after");
  });

  it("shortens animations rather than removing them", () => {
    // `animation: none` never fires animationend, so anything waiting on that
    // event would hang instead of completing instantly.
    const block = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain("animation-duration: 0.01ms !important");
    expect(block).toContain("transition-duration: 0.01ms !important");
    expect(block).not.toContain("animation: none");
  });

  it("leaves the spinners turning, because a frozen one reads as broken", () => {
    const block = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain(".animate-spin");
    expect(block).toContain("animation-iteration-count: infinite !important");
  });
});

describe("prefers-reduced-motion, the component half", () => {
  it("hands every motion component the user's own setting", () => {
    let seen: unknown = "not rendered";

    function Probe() {
      seen = useContext(MotionConfigContext).reducedMotion;
      return null;
    }

    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>
    );

    // "user" follows the OS setting. "always" and "never" would both override
    // it, which is the bug this guards against.
    expect(seen).toBe("user");
  });
});
