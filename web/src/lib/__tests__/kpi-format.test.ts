import { describe, expect, it } from "vitest";
import { formatCount, formatHours, NO_VALUE } from "@/lib/kpi-format";

/**
 * A counter animates through the gaps between whole numbers, so these are
 * called with values no static tile would ever have produced. Every frame is
 * on screen, so every frame has to read like a figure rather than like a
 * float that escaped.
 */
describe("formatCount", () => {
  it("never shows a fraction, however it is handed one", () => {
    for (const midFrame of [0.4, 1233.617, 41.999, 9.5]) {
      expect(formatCount(midFrame, "en-US")).not.toContain(".");
    }
  });

  it("rounds rather than truncates, so it does not sit a whole unit short", () => {
    expect(formatCount(1233.617, "en-US")).toBe("1,234");
    expect(formatCount(41.999, "en-US")).toBe("42");
  });

  it("lands on exactly what the static tile used to print", () => {
    // The animation counts towards this. If the two disagreed, the number
    // would visibly change once more after it had finished.
    for (const total of [0, 7, 42, 1234, 1000000]) {
      expect(formatCount(total, "en-US")).toBe(total.toLocaleString("en-US"));
    }
  });

  it("groups thousands in the locale on screen", () => {
    expect(formatCount(1234567, "en-US")).toBe("1,234,567");
    expect(formatCount(1234567, "id-ID")).toBe("1.234.567");
  });

  it("counts from zero without printing a stray minus", () => {
    // Easing can undershoot; -0 formats as "-0" and would flicker a minus sign.
    expect(formatCount(-0, "en-US")).toBe("0");
    expect(formatCount(-0.2, "en-US")).toBe("0");
  });
});

describe("formatHours", () => {
  it("holds one decimal at every frame", () => {
    for (const midFrame of [0, 0.04, 3.456789, 11.25]) {
      expect(formatHours(midFrame)).toMatch(/^\d+\.\d h$/);
    }
  });

  it("lands on exactly what the static tile used to print", () => {
    for (const hours of [0, 3.5, 11.25, 120]) {
      expect(formatHours(hours)).toBe(`${hours.toFixed(1)} h`);
    }
  });
});

describe("NO_VALUE", () => {
  it("is an em dash, which is what the cycle-time tile has always shown", () => {
    expect(NO_VALUE).toBe("\u2014");
  });
});
