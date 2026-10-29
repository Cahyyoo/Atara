// @vitest-environment jsdom
import "vitest-canvas-mock";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { QcDuplicateCharts } from "@/modules/eksplorasi/components/dashboard/qc-duplicate-charts";
import { CONTROL_ELEMENTS, type ControlElement } from "@/modules/eksplorasi/lib/qc-control";
import type { DuplicatePair, QcDuplicate } from "@/modules/eksplorasi/types";

// Chart.js measures its box and watches it resize; jsdom has neither (as in qc-control-charts.test.tsx).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { value: 600, configurable: true });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { value: 260, configurable: true });
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
});

afterEach(cleanup);

const PAIRS: DuplicatePair[] = [
  { sampleId: "D1", originalId: "F1", x: 1, y: 1.02 },
  { sampleId: "D2", originalId: "F2", x: 2, y: 2.04 },
  { sampleId: "D3", originalId: "F3", x: 3, y: 2.5 },
];

function data(pairs: Partial<Record<ControlElement, DuplicatePair[]>> = {}, skipped = 0): QcDuplicate {
  return {
    campaigns: [],
    months: [],
    campaign: null,
    month: null,
    elements: CONTROL_ELEMENTS.map((element) => ({ element, pairs: pairs[element] ?? [], skipped })),
    unmatched: 0,
    truncated: false,
  };
}

function show(value: QcDuplicate, elements: readonly ControlElement[] = CONTROL_ELEMENTS) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <QcDuplicateCharts data={value} elements={elements} />
    </NextIntlClientProvider>
  );
}

const duplicate = en.qcDashboard.duplicate;

describe("the duplicate charts", () => {
  it("has a card only for the elements chosen, in the usual order", () => {
    show(data(), ["sio2", "ni"]);
    const titles = screen.getAllByText(/^(Ni|Co|Fe2O3|Al2O3|Cr2O3|MgO|SiO2)$/).map((node) => node.textContent);
    expect(titles).toEqual(["Ni", "SiO2"]);
  });

  it("names the ±10% band and the trend with its R², and counts the pairs past ±10%", () => {
    show(data({ ni: PAIRS }, 1), ["ni"]);
    expect(screen.getByText(duplicate.band)).toBeTruthy();
    expect(screen.getByText(/^Linear \(R² = 0\.\d+\)$/)).toBeTruthy();
    expect(screen.getByText("1 pair outside ±10%.")).toBeTruthy();
    expect(screen.getByText("1 pair is not drawn: a value is not a number.")).toBeTruthy();
    expect(screen.getByRole("img", { name: `${duplicate.readings} · Ni` })).toBeTruthy();
  });

  it("writes the trend line's equation and R² under the title, and says when there is none yet", () => {
    show(data({ ni: PAIRS, co: PAIRS.slice(0, 1) }), ["ni", "co"]);
    expect(screen.getByText(/^3 pairs · y = [\d.]+x [+−] [\d.]+ · R² = 0\.\d+$/)).toBeTruthy();
    expect(screen.getByText("1 pair")).toBeTruthy();
    expect(screen.getAllByText(duplicate.noFit)).toHaveLength(1);
  });

  it("follows each element's scatter with its RPD graph and RPD distribution", () => {
    show(data({ ni: PAIRS }), ["ni"]);
    expect(screen.getByRole("img", { name: "RPD Graph Ni" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "RPD Distribution Ni" })).toBeTruthy();
    // D1 and D2 are 2% apart, D3 18%: none at 20%, two of three within 10%.
    expect(screen.getByText("66.7% of pairs at RPD ≤ 10% · 33.3% above")).toBeTruthy();
    expect(screen.queryByText(/at RPD ≥ 20%\.$/)).toBeNull();
  });

  it("counts the pairs at RPD 20% or more", () => {
    show(data({ ni: [...PAIRS, { sampleId: "D4", originalId: "F4", x: 1, y: 1.5 }] }), ["ni"]);
    expect(screen.getByText("1 pair at RPD ≥ 20%.")).toBeTruthy();
  });

  it("says why a card has no chart, the whole story once", () => {
    show(data(), ["co"]);
    expect(screen.getByText(/No duplicate with a Co value is paired with its original yet/)).toBeTruthy();
    expect(screen.getAllByText("No Co pairs to work out an RPD for yet.")).toHaveLength(2);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
