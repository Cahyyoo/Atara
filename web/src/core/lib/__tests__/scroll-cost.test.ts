import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Things that cost work on every frame.
 *
 * Scrolling went heavy across the whole app and two of the causes were mine.
 * Neither produced an error, a warning or a failing test — they were simply
 * expensive, which is invisible until somebody scrolls. These pin the fixes.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const SHELL = readFileSync(
  join(process.cwd(), "src", "core", "components", "layout", "app-shell.tsx"),
  "utf8"
);

/** Properties that force a repaint when animated; none belong in a loop. */
const PAINT_PROPERTIES = [
  "background-position",
  "background-size",
  "box-shadow",
  "background-color",
  "width",
  "height",
  "top",
  "left",
  "filter",
];

describe("the skeleton shimmer", () => {
  const keyframes = (() => {
    const start = CSS.indexOf("@keyframes skeleton-sheen");
    return CSS.slice(start, CSS.indexOf("\n}", start));
  })();

  it("moves with a transform", () => {
    expect(keyframes).toContain("transform: translateX(");
  });

  /**
   * It used to animate background-position, which repaints the element on
   * every frame — and loading.tsx puts dozens of placeholders on screen at
   * once, so that was dozens of elements repainting at 60fps.
   */
  it("animates nothing the compositor cannot handle alone", () => {
    for (const property of PAINT_PROPERTIES) {
      expect(keyframes).not.toContain(property + ":");
    }
  });

  it("runs forever, so it must stay cheap forever", () => {
    // The pairing is the point: infinite is fine on a transform and never
    // fine on a paint property. If this stops being infinite the rule above
    // matters less; if it stays, the rule above is load-bearing.
    expect(CSS).toContain("animation: skeleton-sheen 1.6s ease-in-out infinite");
  });
});

describe("the sticky header's blur", () => {
  /**
   * The only per-frame GPU work in the app, and it is on every page: the
   * browser re-reads and re-blurs whatever is behind the header each frame,
   * and cannot cache it because scrolling changes it. Radius drives the cost.
   */
  it("keeps the radius small", () => {
    const blur = /backdrop-blur-(\w+)/.exec(SHELL)?.[1];

    expect(blur).toBeDefined();
    // xl is 24px and 2xl/3xl are worse. sm (8px) still reads as frosted.
    expect(["xs", "sm"]).toContain(blur);
  });
});

describe("infinite animations anywhere in the stylesheet", () => {
  it("are all on transform or opacity", () => {
    const offenders: string[] = [];

    for (const match of CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      const start = match.index ?? 0;
      const block = CSS.slice(start, CSS.indexOf("\n}", start));
      // Only the ones actually run in a loop.
      if (!new RegExp(`animation:[^;]*\b${match[1]}\b[^;]*infinite`).test(CSS)) continue;

      for (const property of PAINT_PROPERTIES) {
        if (block.includes(property + ":")) offenders.push(`${match[1]} animates ${property}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
