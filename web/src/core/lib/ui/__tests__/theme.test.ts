import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, THEME_COOKIE, isTheme } from "@/core/lib/ui/theme";

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const LAYOUT = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");

describe("theme values", () => {
  it("offers exactly light and dark", () => {
    expect([...THEMES]).toEqual(["light", "dark"]);
    expect(DEFAULT_THEME).toBe("light");
  });

  it("refuses anything else, so a tampered cookie cannot set a class", () => {
    // The value goes straight onto <html> as a class name, so this is the
    // boundary that stops a cookie writing arbitrary markup into it.
    for (const bad of ["", "DARK", "system", "light dark", "../x", undefined]) {
      expect(isTheme(bad)).toBe(false);
    }
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });
});

describe("the class actually reaches the document", () => {
  /**
   * The whole point of keeping this in a cookie rather than localStorage is
   * that the server can put the class on the first byte it sends, so the page
   * never paints light and then flips. That only holds while the layout
   * really does render it.
   */
  it("puts the theme on <html> in the server-rendered layout", () => {
    expect(LAYOUT).toContain("getTheme()");
    expect(LAYOUT).toMatch(/className=\{`\$\{theme\}/);
  });

  it("has tokens for the class the layout writes", () => {
    // A `.dark` class with no matching block would be a silent no-op.
    expect(CSS).toContain(".dark {");
    expect(CSS).toContain("@custom-variant dark (&:is(.dark *));");
  });

  it("redefines every colour token in dark, so none keeps its light value", () => {
    const declarationsIn = (selector: string) => {
      const start = CSS.indexOf(selector + " {");
      const end = CSS.indexOf("\n}", start);
      return new Map(
        [...CSS.slice(start, end).matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm)].map(
          (match) => [match[1], match[2].trim()] as const
        )
      );
    };

    const light = declarationsIn(":root");
    const dark = declarationsIn(".dark");

    // Colours only. --radius and its kin are geometry and are meant to be
    // shared; a *colour* defined only in light silently keeps its light value
    // in dark mode, which is how a white surface survives into a dark theme.
    const isColour = (value: string) => /oklch\(|#[0-9a-f]{3,8}\b|gradient\(/i.test(value);
    const missing = [...light]
      .filter(([, value]) => isColour(value))
      .map(([token]) => token)
      .filter((token) => !dark.has(token));

    expect(missing).toEqual([]);
  });
});

describe("the cookie", () => {
  it("is named distinctly enough not to collide with the locale one", () => {
    expect(THEME_COOKIE).toBe("atara-theme");
    expect(THEME_COOKIE).not.toBe("NEXT_LOCALE");
  });
});
