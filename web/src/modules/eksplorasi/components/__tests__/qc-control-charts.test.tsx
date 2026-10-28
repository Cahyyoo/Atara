// @vitest-environment jsdom
import "vitest-canvas-mock";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { QcControlCharts } from "@/modules/eksplorasi/components/dashboard/qc-control-charts";
import { CONTROL_ELEMENTS, controlLimits } from "@/modules/eksplorasi/lib/qc-control";
import type { QcControl } from "@/modules/eksplorasi/types";

// Chart.js measures its box and watches it resize; jsdom has neither (as in dashboard-charts.test.tsx).
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

const limits = controlLimits("1.00", "0.10");

function data(overrides: Partial<Record<string, Partial<QcControl["elements"][number]>>> = {}): QcControl {
  return {
    standards: ["Oreas189"],
    standard: "Oreas189",
    testMethod: "Fusion XRF",
    truncated: false,
    elements: CONTROL_ELEMENTS.map((element) => ({
      element,
      limits: null,
      points: [],
      skipped: 0,
      ...overrides[element],
    })),
  };
}

function show(value: QcControl) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <QcControlCharts data={value} />
    </NextIntlClientProvider>
  );
}

describe("a standard's control charts", () => {
  it("has a card for every element the standard is certified for", () => {
    show(data());
    for (const name of ["Ni", "Co", "Fe2O3", "Al2O3", "Cr2O3", "MgO", "SiO2"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("says why a card has no chart: no CRM value, or no assays yet", () => {
    show(data({ ni: { limits } }));
    expect(screen.getByText(/No assays of Oreas189 with a Ni value yet/)).toBeTruthy();
    expect(screen.getByText(/no value or SD of Co for Oreas189 \(Fusion XRF\)/)).toBeTruthy();
  });

  it("names its lines in the legend, and counts readings past ±3σ", () => {
    show(
      data({
        ni: {
          limits,
          points: [
            { sampleId: "A", date: null, x: 10, y: 1.02 },
            { sampleId: "B", date: null, x: 30, y: 1.45 },
          ],
          skipped: 1,
        },
      })
    );
    expect(screen.getByText("+1σ / −1σ")).toBeTruthy();
    expect(screen.getByText("+3σ / −3σ")).toBeTruthy();
    expect(screen.getByText("1 point outside ±3σ.")).toBeTruthy();
    expect(screen.getByText("1 assay is not drawn: its value is not a number.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Ni · Oreas189" })).toBeTruthy();
  });
});
