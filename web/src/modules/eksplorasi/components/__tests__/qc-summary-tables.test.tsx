// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { QcStandardTable } from "@/modules/eksplorasi/components/dashboard/qc-standard-table";
import { QcDuplicateTable } from "@/modules/eksplorasi/components/dashboard/qc-duplicate-table";
import type { QcControl, QcDuplicate, StandardSummaryRow } from "@/modules/eksplorasi/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      {children}
    </NextIntlClientProvider>
  );
}

const row = (standard: string, overrides: Partial<StandardSummaryRow> = {}): StandardSummaryRow => ({
  standard,
  certified: 1.02,
  sd: 0.009,
  n: 4,
  mean: 1.0125,
  min: 1,
  max: 1.03,
  within1: 0.5,
  within2: 0.95,
  within3: 1,
  outside2: 0.05,
  remarks: null,
  ...overrides,
});

const SUMMARY: QcControl["summary"] = [
  {
    element: "ni",
    rows: [row("Oreas184", { remarks: "Good" }), row("Oreas187", { within2: 0.9, outside2: 0.1 }), row("Oreas189", { n: 0, mean: null, min: null, max: null, within1: null, within2: null, within3: null, outside2: null })],
  },
];

const cells = (name: string) =>
  within(screen.getByRole("row", { name: new RegExp(`^${name}`) }))
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

describe("the standard table", () => {
  it("gives each standard's figures, marking Outside 2 SD past 5% only", () => {
    wrap(<QcStandardTable summary={SUMMARY} />);
    expect(screen.getByText("Standard Ni")).toBeTruthy();
    expect(cells("Oreas184")).toEqual([
      "Oreas184",
      "1.02",
      "4",
      "0.009",
      "1.0125",
      "1",
      "1.03",
      "50.00%",
      "95.00%",
      "100.00%",
      "5.00%",
      "Good",
    ]);
    const outside = (name: string) => within(screen.getByRole("row", { name: new RegExp(`^${name}`) })).getAllByRole("cell")[10];
    expect(outside("Oreas184").className).not.toContain("text-destructive");
    expect(outside("Oreas187").className).toContain("text-destructive");
    expect(cells("Oreas189").slice(2, 5)).toEqual(["0", "0.009", "—"]);
  });

  it("writes the Remarks through the dialog and shows them at once", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ...JSON.parse(String(init?.body)), remarks: "Re-assay" } }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    wrap(<QcStandardTable summary={SUMMARY} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit the Remarks on Oreas187 Ni" }));
    fireEvent.change(screen.getByLabelText("Remarks"), { target: { value: "Re-assay" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(cells("Oreas187").at(-1)).toBe("Re-assay"));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/data-sources/qc/standard-remarks");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({ standard: "Oreas187", element: "ni", remarks: "Re-assay" });
  });
});

describe("the duplicate table", () => {
  it("has a row per element given, with the pairs, the RPD and the readings' range", () => {
    const elements: QcDuplicate["elements"] = [
      {
        element: "ni",
        pairs: [
          { sampleId: "D1", originalId: "F1", x: 1, y: 1.1 },
          { sampleId: "D2", originalId: "F2", x: 2, y: 2 },
        ],
        skipped: 1,
      },
    ];
    wrap(<QcDuplicateTable elements={elements} />);
    // 3 pairs, 2 with an RPD: (9.52% + 0%) / 2.
    expect(cells("Ni")).toEqual(["Ni", "3", "2", "4.76%", "1.5", "1", "2", "1.55", "1.1", "2"]);
  });
});
