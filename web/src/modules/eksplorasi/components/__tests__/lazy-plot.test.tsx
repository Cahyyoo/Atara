// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LazyPlot } from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";

/** A dashboard chart is built as it nears the screen, not all thirty as the page opens. */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

function stubObserver() {
  const observer = { callback: null as Callback | null, observe: vi.fn(), disconnect: vi.fn(), options: undefined as unknown };
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: Callback, options: unknown) {
        observer.callback = callback;
        observer.options = options;
      }
      observe = observer.observe;
      disconnect = observer.disconnect;
    }
  );
  return observer;
}

describe("a chart's box", () => {
  it("holds its place until the chart nears the screen, then builds it and stops watching", () => {
    const observer = stubObserver();
    render(
      <LazyPlot>
        <p>a chart</p>
      </LazyPlot>
    );
    expect(screen.queryByText("a chart")).toBeNull();
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.options).toMatchObject({ rootMargin: expect.stringContaining("px") });

    act(() => observer.callback!([{ isIntersecting: false }]));
    expect(screen.queryByText("a chart")).toBeNull();

    act(() => observer.callback!([{ isIntersecting: true }]));
    expect(screen.getByText("a chart")).toBeTruthy();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("builds the chart at once where there is no observer", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(
      <LazyPlot>
        <p>a chart</p>
      </LazyPlot>
    );
    expect(screen.getByText("a chart")).toBeTruthy();
  });
});
