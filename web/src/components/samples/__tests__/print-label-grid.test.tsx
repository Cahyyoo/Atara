// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { PrintLabelGrid, clampCopies, MAX_COPIES } from "@/components/samples/print-label-grid";
import type { SampleListItemDTO } from "@/types";

function sample(code: string): SampleListItemDTO {
  return {
    id: code,
    sampleCode: code,
    labCode: null,
    sampleIdent: null,
    status: "PENDING",
    currentStageId: null,
    currentStage: null,
    createdBy: { id: "u1", name: "Main Admin" },
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

const SAMPLES = [sample("NKL-2026-00001"), sample("NKL-2026-00002")];

/** The printed code under each QR, in document order. */
function printedCodes(): string[] {
  return Array.from(document.querySelectorAll("p")).map((node) => node.textContent ?? "");
}

afterEach(cleanup);

describe("PrintLabelGrid", () => {
  it("prints the sample code and nothing beside it", () => {
    render(<PrintLabelGrid samples={SAMPLES} />);

    expect(screen.getByText("NKL-2026-00001")).toBeDefined();
    // One line of text per label: the code. Anything else on a 40mm sticker
    // competes for room with the QR and makes both harder to read.
    expect(printedCodes()).toEqual(["NKL-2026-00001", "NKL-2026-00002"]);
  });

  it("prints one label per sample by default", () => {
    render(<PrintLabelGrid samples={SAMPLES} />);
    expect(printedCodes()).toEqual(["NKL-2026-00001", "NKL-2026-00002"]);
  });

  it("repeats each sample and keeps its copies together", () => {
    render(<PrintLabelGrid samples={SAMPLES} copies={3} />);

    // Grouped, not interleaved: copies of one code stay adjacent to cut.
    expect(printedCodes()).toEqual([
      "NKL-2026-00001",
      "NKL-2026-00001",
      "NKL-2026-00001",
      "NKL-2026-00002",
      "NKL-2026-00002",
      "NKL-2026-00002",
    ]);
  });

  it("renders one QR per label", () => {
    const { container } = render(<PrintLabelGrid samples={SAMPLES} copies={2} />);
    expect(container.querySelectorAll("svg")).toHaveLength(4);
  });

  it("applies the column class as a full literal, so Tailwind emits it", () => {
    const { container, rerender } = render(<PrintLabelGrid samples={SAMPLES} columns={3} />);
    const grid = () => container.querySelector(".print-label-grid")!;

    expect(grid().className).toContain("grid-cols-3");

    rerender(<PrintLabelGrid samples={SAMPLES} columns={5} />);
    expect(grid().className).toContain("grid-cols-5");
    expect(grid().className).not.toContain("grid-cols-3");
  });

  it("never renders fewer than one copy, whatever the input held", () => {
    // A cleared number field reads back as 0; the preview must not empty out.
    render(<PrintLabelGrid samples={SAMPLES} copies={0} />);
    expect(printedCodes()).toEqual(["NKL-2026-00001", "NKL-2026-00002"]);
  });
});

describe("clampCopies", () => {
  it("keeps a sane count out of anything a number input can produce", () => {
    expect(clampCopies(3)).toBe(3);
    expect(clampCopies(0)).toBe(1); // cleared field
    expect(clampCopies(-4)).toBe(1);
    expect(clampCopies(Number("abc"))).toBe(1); // NaN
    expect(clampCopies(Infinity)).toBe(1); // nonsense falls back, same as NaN
    expect(clampCopies(999)).toBe(MAX_COPIES);
    expect(clampCopies(2.7)).toBe(2);
  });
});
