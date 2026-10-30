// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { resetPersistedColumns } from "@/core/hooks/use-persisted-columns";
import { QcDashboard } from "@/modules/eksplorasi/components/dashboard/qc-dashboard";
import { BLANK_ELEMENTS } from "@/modules/eksplorasi/lib/qc-blank";
import { CONTROL_ELEMENTS } from "@/modules/eksplorasi/lib/qc-control";
import type { DashboardTab } from "@/modules/eksplorasi/lib/dashboard-tabs";
import type { QcBlank, QcControl, QcDuplicate, StandardSummaryRow } from "@/modules/eksplorasi/types";

// The charts have their own tests; here they would only be canvases to wait for.
vi.mock("@/modules/eksplorasi/components/dashboard/qc-control-charts", () => ({ QcControlCharts: () => null }));
vi.mock("@/modules/eksplorasi/components/dashboard/qc-blank-charts", () => ({ QcBlankCharts: () => null }));
vi.mock("@/modules/eksplorasi/components/dashboard/qc-duplicate-charts", () => ({ QcDuplicateCharts: () => null }));

/** The dashboard's tabs, the counts on them, and the standard table's element tabs. */

const row = (standard: string, within2: number): StandardSummaryRow => ({
  standard,
  certified: 1,
  sd: 0.1,
  n: 10,
  mean: 1,
  min: 0.8,
  max: 1.2,
  within1: within2,
  within2,
  within3: 1,
  outside2: 1 - within2,
  remarks: null,
});

const CONTROL: QcControl = {
  standards: ["Oreas184"],
  standard: "Oreas184",
  campaigns: [],
  campaign: null,
  testMethod: "Fusion XRF",
  // Oreas184's Ni has 20% past 2 SD: one row to check.
  summary: [
    { element: "ni", rows: [row("Oreas184", 0.8)] },
    { element: "co", rows: [row("Oreas184", 1)] },
  ],
  elements: CONTROL_ELEMENTS.map((element) => ({ element, limits: null, points: [], skipped: 0 })),
  truncated: false,
};

const BLANK: QcBlank = {
  campaigns: [],
  campaign: null,
  // One Ni reading past the Preferred Value.
  elements: BLANK_ELEMENTS.map((element) => ({
    element,
    limit: 0.01,
    points: element === "ni" ? [{ sampleId: "B1", x: 1, y: 0.02, belowDetection: false }] : [],
    skipped: 0,
  })),
  truncated: false,
};

const DUPLICATES: QcDuplicate = {
  campaigns: [],
  months: [],
  campaign: null,
  month: null,
  elements: CONTROL_ELEMENTS.map((element) => ({ element, pairs: [], skipped: 0 })),
  unmatched: 0,
  truncated: false,
};

beforeEach(() => {
  window.localStorage.clear();
  resetPersistedColumns();
  window.history.replaceState(null, "", "/eksplorasi/dashboard");
});
afterEach(cleanup);

function show(initialTab: DashboardTab = "standard") {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <QcDashboard initialTab={initialTab} initialControl={CONTROL} initialBlank={BLANK} duplicates={DUPLICATES} />
    </NextIntlClientProvider>
  );
}

const tabs = en.qcDashboard.tabs;
const tab = (name: string) =>
  screen.getByRole("tab", { name: new RegExp(`^${name.replace(/[()]/g, "\\$&")}`) });
const panel = (name: DashboardTab) => document.getElementById(`qc-panel-${name}`)!;

describe("the dashboard's tabs", () => {
  it("open the tab the address names, the others' panels kept but hidden", () => {
    show("blank");
    expect(tab(tabs.blank).getAttribute("aria-selected")).toBe("true");
    expect(panel("blank").hidden).toBe(false);
    expect(panel("standard").hidden).toBe(true);
    expect(panel("duplicate").hidden).toBe(true);
  });

  it("switch on a click and keep the tab in the address", () => {
    show();
    fireEvent.click(tab(tabs.duplicate));
    expect(panel("duplicate").hidden).toBe(false);
    expect(panel("standard").hidden).toBe(true);
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("duplicate");
  });

  it("move with the arrow keys, round from the last to the first", () => {
    show("duplicate");
    act(() => tab(tabs.duplicate).focus());
    fireEvent.keyDown(tab(tabs.duplicate), { key: "ArrowRight" });
    expect(document.activeElement).toBe(tab(tabs.standard));
    expect(panel("standard").hidden).toBe(false);
  });

  it("count what needs a look in each, in words as well as the mark", () => {
    show();
    expect(within(tab(tabs.standard)).getByText("1 needs a look")).toBeTruthy();
    expect(within(tab(tabs.blank)).getByText("1 needs a look")).toBeTruthy();
    expect(within(tab(tabs.duplicate)).queryByText(/needs a look/)).toBeNull();
  });
});

describe("the standard section", () => {
  it("opens straight on its table, with no summary cards above it", () => {
    show();
    expect(screen.queryByRole("group", { name: /summary$/ })).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("shows one element's table at a time, picked from the card's tabs", () => {
    show();
    expect(screen.getByText("Standard Ni")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Co" }));
    expect(screen.getByText("Standard Co")).toBeTruthy();
    expect(screen.queryByText("Standard Ni")).toBeNull();
  });
});
