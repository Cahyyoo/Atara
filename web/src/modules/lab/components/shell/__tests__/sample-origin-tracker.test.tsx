// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { SampleOriginTracker } from "@/modules/lab/components/shell/sample-origin-tracker";
import { readSampleOrigin } from "@/modules/lab/lib/samples/sample-origin";

let pathname = "/lab/assay";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

/** Moves the address the way the app does: the list's filters, then a link. */
function go(path: string, rerender: (node: React.ReactNode) => void) {
  // The press on the link lands while the list's address is still showing.
  fireEvent.pointerDown(document.body);
  window.history.pushState(null, "", path);
  pathname = path.split("?")[0];
  rerender(<SampleOriginTracker />);
}

describe("SampleOriginTracker", () => {
  it("remembers the list a sample was opened from, with the filters it had then", () => {
    pathname = "/lab/assay";
    window.history.pushState(null, "", "/lab/assay");
    const { rerender } = render(<SampleOriginTracker />);
    // A filter set after the page opened, written with replaceState.
    window.history.replaceState(null, "", "/lab/assay?results=missing");

    go("/lab/samples/SMPL-1/sub/-20", rerender);
    expect(readSampleOrigin()).toBe("/lab/assay?results=missing");

    // Up to the sample and on to another sub: still the list.
    go("/lab/samples/SMPL-1", rerender);
    go("/lab/samples/SMPL-1/sub/%2B40", rerender);
    expect(readSampleOrigin()).toBe("/lab/assay?results=missing");
  });
});
