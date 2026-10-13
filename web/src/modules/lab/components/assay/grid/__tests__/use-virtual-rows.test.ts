import { describe, expect, it } from "vitest";
import { windowOf } from "@/modules/lab/components/assay/grid/use-virtual-rows";

/** Five thousand rows, of which only the ones on screen are rendered. */
describe("the rows in view", () => {
  it("are the screenful at the top, and a few past it", () => {
    expect(windowOf(0, 360, 5000, 36, 8)).toEqual({ start: 0, end: 18, padTop: 0, padBottom: (5000 - 18) * 36 });
  });

  it("follow the scroll, with spacers keeping the scrollbar the full length", () => {
    const view = windowOf(36 * 1000, 360, 5000, 36, 8);
    expect(view.start).toBe(992);
    expect(view.end).toBe(1018);
    expect(view.padTop + (view.end - view.start) * 36 + view.padBottom).toBe(5000 * 36);
  });

  it("still show rows when the list has just shrunk under an old scroll position", () => {
    // Scrolled to row 4,990 of 5,000, then cleared back to thirty rows.
    const view = windowOf(36 * 4990, 360, 30, 36, 8);
    expect(view.end).toBe(30);
    expect(view.end - view.start).toBeGreaterThan(0);
  });

  it("stop at the last row", () => {
    const view = windowOf(36 * 4990, 360, 5000, 36, 8);
    expect(view.end).toBe(5000);
    expect(view.padBottom).toBe(0);
  });
});
