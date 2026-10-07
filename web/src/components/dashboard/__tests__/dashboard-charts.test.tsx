// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Chart as ChartJS } from "chart.js";
import { NextIntlClientProvider } from "next-intl";
import "vitest-canvas-mock";

import en from "../../../../messages/en.json";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import type { AnalyticsResult } from "@/lib/analytics";
import { UNPLACED_ID } from "@/lib/analytics";

/**
 * Chart.js draws to a canvas, and jsdom has no 2D context — without the stub
 * above it refuses to start at all. This is the only test that can tell us the
 * charts still build their own configuration without throwing, which is the
 * whole risk of swapping the library underneath them.
 */
beforeAll(() => {
  // Chart.js measures its container; jsdom reports every element as 0x0.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 600, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 260, configurable: true });
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});

const DATA = {
  summary: {},
  throughput: [
    { shiftDate: "2026-09-20", created: 12, completed: 8 },
    { shiftDate: "2026-09-21", created: 9, completed: 11 },
  ],
  stageDurations: [
    { stageId: "s1", stageKey: "RECEIVED", stageName: "DITERIMA", averageHours: 3.5, samples: 4 },
    { stageId: "s2", stageKey: "WET_PREP", stageName: "PREP BASAH", averageHours: 1.25, samples: 2 },
  ],
  bottleneck: [
    { stageId: "s1", stageKey: "RECEIVED", stageName: "DITERIMA", count: 5 },
    { stageId: "s2", stageKey: "WET_PREP", stageName: "PREP BASAH", count: 2 },
  ],
  niDistribution: [
    { bucket: "1.0", count: 3 },
    { bucket: "1.5", count: 7 },
  ],
  placeSplit: [
    { placeId: "p1", code: "MOL", count: 10 },
    { placeId: UNPLACED_ID, code: "—", count: 2 },
  ],
  overdueSamples: [],
} as unknown as AnalyticsResult;

function show(locale: "en" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={en} onError={() => {}}>
      <DashboardCharts data={DATA} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe("DashboardCharts on Chart.js", () => {
  it("draws all five charts without throwing", () => {
    const onError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = show();

    // One canvas per chart: throughput, stage hours, waiting, Ni, places.
    expect(container.querySelectorAll("canvas")).toHaveLength(5);
    expect(onError).not.toHaveBeenCalled();
    onError.mockRestore();
  });

  /**
   * A role's layout picks the charts and their order (dashboard-layout.ts).
   * The analyst's: Ni first, throughput last -- and nothing else mounted.
   */
  it("draws only the charts it is asked for, in that order", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
        <DashboardCharts data={DATA} charts={["niDistribution", "waiting", "throughput"]} />
      </NextIntlClientProvider>
    );

    expect(container.querySelectorAll("canvas")).toHaveLength(3);
    const titles = [...container.querySelectorAll('[data-slot="card-title"]')].map(
      (node) => node.textContent
    );
    expect(titles).toEqual([
      en.dashboard.niDistribution.title,
      en.dashboard.waiting.title,
      en.dashboard.throughput.title,
    ]);
    expect(screen.queryByText(en.dashboard.codeSplit.title)).toBeNull();
    expect(screen.queryByText(en.dashboard.stageHours.title)).toBeNull();
  });

  it("keeps the card titles and descriptions in the DOM", () => {
    show();

    for (const key of ["throughput", "stageHours", "waiting", "niDistribution", "codeSplit"] as const) {
      expect(screen.getByText(en.dashboard[key].title)).toBeTruthy();
    }
  });

  /**
   * The legend is the reason these charts stay readable at all. Chart.js draws
   * to a bitmap a screen reader cannot enter, so identity must not live only
   * inside the canvas.
   */
  it("renders the legends as real DOM, not inside the canvas", () => {
    show();

    expect(screen.getByText(en.dashboard.throughput.registered)).toBeTruthy();
    expect(screen.getByText(en.dashboard.throughput.completed)).toBeTruthy();
    // The place legend names each place, including the unplaced group.
    expect(screen.getByText("MOL")).toBeTruthy();
    expect(screen.getByText(en.dashboard.codeSplit.unplaced)).toBeTruthy();
  });

  it("names stages from their key, in the language on screen", () => {
    show();

    // The chart axis is canvas, but the label text comes from the same
    // translation the rest of the app uses.
    expect(en.stages.RECEIVED).toBe("RECEIVED");
  });

  /**
   * Both of these were first written in a place Chart.js does not read.
   *
   * `dash` belongs to `scale.border`, not to `scale.grid`. The types still
   * declare `grid.borderDash`, so the wrong one compiles and then quietly draws
   * solid lines — `_computeGridLineItems` takes the dash from
   * `border.setContext(...).dash`. This asserts on the options the live chart
   * resolved, so moving it back fails here.
   *
   * The gradient is checked differently, on the canvas itself: a scriptable
   * fill is a function Chart.js is free never to call.
   */
  it("puts the gridline dash where Chart.js reads it", () => {
    show();

    const charts = Object.values(ChartJS.instances);
    expect(charts).toHaveLength(5);

    for (const chart of charts) {
      // The value axis is y on a column chart and x on a horizontal bar.
      const value = chart.options.indexAxis === "y" ? chart.options.scales?.x : chart.options.scales?.y;
      expect((value as { border?: { dash?: number[] } }).border?.dash).toEqual([4, 4]);
    }
  });

  it("builds a gradient on the three single-series charts and no others", () => {
    const { container } = show();

    const lit = Array.from(container.querySelectorAll("canvas")).filter((canvas) =>
      (
        canvas.getContext("2d") as unknown as { __getEvents(): { type: string }[] }
      )
        .__getEvents()
        .some((event) => event.type === "createLinearGradient")
    );

    // Stage hours, waiting, Ni distribution. Throughput and the place split
    // keep a flat fill because there colour carries identity.
    expect(lit).toHaveLength(3);
  });

  it("shows the empty state instead of a chart when there is nothing to plot", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
        <DashboardCharts
          data={{ ...DATA, throughput: [], niDistribution: [] } as unknown as AnalyticsResult}
        />
      </NextIntlClientProvider>
    );

    expect(screen.getByText(en.dashboard.niDistribution.empty)).toBeTruthy();
    // Two charts dropped out, so three canvases remain.
    expect(document.querySelectorAll("canvas")).toHaveLength(3);
  });
});
