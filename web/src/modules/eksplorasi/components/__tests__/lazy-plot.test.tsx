// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LazyPlot } from "@/modules/eksplorasi/components/dashboard/qc-chart-parts";

/**
 * A dashboard chart is built as it nears the screen, not all thirty as the
 * page opens -- and charts that come into sight together are built in turn,
 * a frame or so apart, rather than in one frame that locks the page.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame"] });
});
afterEach(() => {
  cleanup();
  // The line is the module's, shared by every box: let it run dry before the next test.
  act(() => vi.runAllTimers());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

/** Every box's observer, in the order the boxes were drawn. */
function stubObservers() {
  const observers: { callback: Callback; options: unknown; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: Callback, options: unknown) {
        observers.push({ callback, options, observe: this.observe, disconnect: this.disconnect });
      }
    }
  );
  return observers;
}

/** One frame and the gap after it. */
const nextTurn = () => act(() => vi.advanceTimersByTime(100));

describe("a chart's box", () => {
  it("holds its place until the chart nears the screen, then builds it and stops watching", () => {
    const observers = stubObservers();
    render(
      <LazyPlot>
        <p>a chart</p>
      </LazyPlot>
    );
    const [observer] = observers;
    expect(screen.queryByText("a chart")).toBeNull();
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.options).toMatchObject({ rootMargin: expect.stringContaining("px") });

    act(() => observer.callback([{ isIntersecting: false }]));
    nextTurn();
    expect(screen.queryByText("a chart")).toBeNull();

    act(() => observer.callback([{ isIntersecting: true }]));
    expect(observer.disconnect).toHaveBeenCalled();
    nextTurn();
    expect(screen.getByText("a chart")).toBeTruthy();
  });

  it("builds charts that come into sight together one after another", () => {
    const observers = stubObservers();
    render(
      <>
        <LazyPlot>
          <p>first</p>
        </LazyPlot>
        <LazyPlot>
          <p>second</p>
        </LazyPlot>
      </>
    );
    act(() => observers.forEach((observer) => observer.callback([{ isIntersecting: true }])));

    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.queryByText("second")).toBeNull();

    nextTurn();
    expect(screen.getByText("second")).toBeTruthy();
  });

  it("leaves the line when its box goes before its turn, so the next is not kept waiting", () => {
    const observers = stubObservers();
    const gone = render(
      <LazyPlot>
        <p>gone</p>
      </LazyPlot>
    );
    render(
      <LazyPlot>
        <p>kept</p>
      </LazyPlot>
    );
    act(() => observers.forEach((observer) => observer.callback([{ isIntersecting: true }])));
    gone.unmount();

    // The first turn goes to the box still there.
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByText("kept")).toBeTruthy();
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
