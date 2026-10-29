// @vitest-environment jsdom
import "vitest-canvas-mock";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { QcBlankTable } from "@/modules/eksplorasi/components/dashboard/qc-blank-table";
import { QcBlankCharts } from "@/modules/eksplorasi/components/dashboard/qc-blank-charts";
import { BLANK_ELEMENTS } from "@/modules/eksplorasi/lib/qc-blank";
import type { BlankPoint, QcBlank } from "@/modules/eksplorasi/types";

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

const NI: BlankPoint[] = [
  { sampleId: "B1", x: 1, y: 0.01, belowDetection: true },
  { sampleId: "B2", x: 2, y: 0.03, belowDetection: false },
  { sampleId: "B3", x: 3, y: 0.005, belowDetection: false },
  { sampleId: "B4", x: 4, y: 0.01, belowDetection: false },
];

function data(): QcBlank {
  return {
    campaigns: ["C1"],
    campaign: null,
    elements: BLANK_ELEMENTS.map((element) => ({
      element,
      limit: element === "cr2o3" ? null : element === "fe2o3" ? 10 : 0.01,
      points: element === "ni" ? NI : [],
      skipped: element === "ni" ? 1 : 0,
    })),
    truncated: false,
  };
}

function wrap(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      {children}
    </NextIntlClientProvider>
  );
}

const blank = en.qcDashboard.blank;

describe("the blank table", () => {
  it("has a row for each element with a blank limit, with the anomalies past the Preferred Value", () => {
    wrap(<QcBlankTable data={data()} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["Ni", "Co", "Fe2O3", "Cr2O3"]);
    // N, mean, Preferred Value, anomalies, %, min, max: only 0.03 is past 0.01.
    expect(within(rows[0]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Ni",
      "4",
      "0.0138",
      "0.01",
      "1",
      "25.00%",
      "0.005",
      "0.03",
    ]);
    // No readings, and no Preferred Value for Cr2O3.
    expect(within(rows[3]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Cr2O3", "0", "—", "—", "—", "—", "—", "—"]);
  });
});

describe("the blank charts", () => {
  it("count the anomalies, the readings below detection and those not drawn", () => {
    wrap(<QcBlankCharts entries={data().elements.filter((entry) => entry.element === "ni")} />);
    expect(screen.getByRole("img", { name: "Ni Blank Sample Value" })).toBeTruthy();
    expect(screen.getByText("1 blank past the Preferred Value.")).toBeTruthy();
    expect(screen.getByText("1 reading below the detection limit is taken at the limit.")).toBeTruthy();
    expect(screen.getByText("1 blank is not drawn: its value is not a number.")).toBeTruthy();
    expect(screen.getByText("Preferred Value 0.01")).toBeTruthy();
  });

  it("say why a card has no chart or no line", () => {
    wrap(<QcBlankCharts entries={data().elements.filter((entry) => entry.element === "cr2o3")} />);
    expect(screen.getByText("No blank with a Cr2O3 value yet.")).toBeTruthy();
    expect(screen.getByText(blank.noLimit.replace("{element}", "Cr2O3"))).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
