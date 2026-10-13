// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChartBox } from "@/modules/lab/components/dashboard/chart-kit";
import { CHART_ANIMATION_MS } from "@/core/lib/ui/chart-theme";
import { CHART_REVEAL_MS, CHART_STAGGER_TOTAL_MS } from "@/core/lib/ui/chart-stagger";

/**
 * Every chart grows from zero as the dashboard opens, all five together.
 *
 * Two things about that are invisible to a type check: that no chart is held
 * back waiting to be scrolled to, and that a canvas asks about reduced motion
 * itself, because CSS cannot shorten what a script paints.
 */

const CHARTS = readFileSync(
  join(process.cwd(), "src", "modules", "lab", "components", "dashboard", "dashboard-charts.tsx"),
  "utf8"
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the box a chart lives in", () => {
  /**
   * It used to hold its chart back until the box was scrolled to. Measured in
   * a real browser, that made opening the dashboard look like one chart
   * animating and four empty boxes. Every chart now goes in at once, so all
   * five grow from zero as the page opens.
   */
  it("puts the chart in straight away, with no observer to wait for", () => {
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        disconnect() {}
      }
    );

    render(
      <ChartBox className="h-[260px]">
        <p>a chart</p>
      </ChartBox>
    );

    expect(screen.getByText("a chart")).toBeTruthy();
    expect(observe).not.toHaveBeenCalled();
  });

  it("keeps the height on the box, not on the chart", () => {
    // Otherwise the page jumps when the canvas arrives.
    const { container } = render(
      <ChartBox className="h-[260px]">
        <p>a chart</p>
      </ChartBox>
    );

    expect(container.firstElementChild?.className).toContain("h-[260px]");
  });

  it("wraps every one of the five charts", () => {
    expect(CHARTS.match(/<ChartBox className=/g)).toHaveLength(5);
  });
});

describe("the animation itself", () => {
  it("is stated rather than inherited", () => {
    // Chart.js animates by default. Leaving it implicit meant the duration
    // was a number nobody had chosen.
    expect(CHARTS).toContain("animation:");
    expect(CHARTS).toContain("CHART_ANIMATION_MS");
    expect(CHART_ANIMATION_MS).toBeGreaterThan(0);
  });

  it("is short enough to be over before the number is read", () => {
    // Longer, and somebody is waiting on a bar whose length they can already
    // see the shape of.
    expect(CHART_ANIMATION_MS).toBeLessThanOrEqual(900);
  });

  it("stops when the reader has asked for less movement", () => {
    /**
     * The gap this closes. globals.css has a prefers-reduced-motion block and
     * MotionProvider passes reducedMotion="user", and neither reaches a
     * canvas: a media query cannot shorten something a script is painting
     * frame by frame. Without this the charts would be the one thing in the
     * app that carried on moving after somebody said to stop.
     */
    expect(CHARTS).toContain("useReducedMotion()");
    // `false`, not a short duration: a canvas fires no animationend, so there
    // is nothing waiting on the animation to keep alive. Matched loosely
    // enough to survive the formatter moving the ternary onto its own lines,
    // which is what the literal string used to break on.
    expect(CHARTS).toMatch(/reducedMotion\s*\?\s*false\s*:/);
  });

  describe("the stagger", () => {
    it("sequences the bars rather than blinking them all at once", () => {
      expect(CHARTS).toContain("delay: barEntranceDelay");
    });

    /**
     * Four of five would leave one chart re-staggering on every filter change,
     * and it is the most likely slip given the shape of that JSX.
     */
    it("tells every chart when it has arrived", () => {
      expect(CHARTS.match(/barEntrancePlugin\]/g)).toHaveLength(5);
    });

    it("rides on the growth without making the chart slow", () => {
      expect(CHART_REVEAL_MS).toBeLessThanOrEqual(1000);
      expect(CHART_STAGGER_TOTAL_MS).toBeLessThan(CHART_ANIMATION_MS);
    });

    /**
     * The three clauses whose removal compiles cleanly, passes every other
     * test, and breaks something a reader would feel rather than see. Asserted
     * against the source because there is no type that can hold them.
     */
    it("keeps its guards", () => {
      const stagger = readFileSync(join(process.cwd(), "src", "core", "lib", "ui", "chart-stagger.ts"), "utf8");

      expect(stagger).toContain('context.type !== "data"');
      expect(stagger).toContain('context.mode !== "default"');
      // The one no mode check can replace: an arrival and a filter change
      // reach Chart.js with the same mode.
      expect(stagger).toContain("isEntering(context.chart)");
    });

    /**
     * The label is only derived from geometry while the bar is actually
     * moving. Simplified away, the chart would settle on a number read back
     * out of a pixel -- which agrees with the data today only because nothing
     * has set alignToPixels or minBarLength yet.
     */
    it("reads the bar rather than the pixel once the bar has stopped", () => {
      const labels = readFileSync(
        join(process.cwd(), "src", "core", "lib", "ui", "chart-value-labels.ts"),
        "utf8"
      );

      expect(labels).toContain("$animations");
      expect(labels).toContain("active()");
      // Not chart.scales["x"]: the dataset knows which scale it is plotted on.
      expect(labels).toContain("meta.vScale");
    });
  });

  it("re-reads the preference rather than snapshotting it", () => {
    // Turning it on partway through a session is exactly when somebody has
    // had enough of the movement.
    const hook = readFileSync(
      join(process.cwd(), "src", "core", "lib", "ui", "use-reduced-motion.ts"),
      "utf8"
    );
    expect(hook).toContain('addEventListener("change"');
    expect(hook).toContain('removeEventListener("change"');
  });
});
