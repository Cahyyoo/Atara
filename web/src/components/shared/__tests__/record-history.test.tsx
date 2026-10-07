// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";
import { RecordHistoryDialog } from "@/components/shared/record-history-dialog";
import { ResultsHistory } from "@/components/assay/results-history";
import type { LabRecordListItemDTO, RecordHistoryEntry } from "@/types";

let query = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/assay/history",
  useSearchParams: () => query,
}));

/** A result filled in, one replaced on purpose, and one on a sub-sample. */
const ENTRIES: RecordHistoryEntry[] = [
  {
    id: "a3",
    changedAt: "2026-10-05T03:00:00.000Z",
    changedBy: "Lab Analyst",
    reason: "Overwrote earlier results",
    changes: { ni: { from: 1.2, to: 1.35 } },
    record: { id: "r1", labCode: "SPR.1", sampleIdent: "LAM/SAM/1/25", subCode: null, sampleCode: "SMPL-1" },
  },
  {
    id: "a2",
    changedAt: "2026-10-05T02:00:00.000Z",
    changedBy: "Lab Analyst",
    reason: null,
    changes: { fe: { from: null, to: 22 } },
    record: { id: "r1s", labCode: "SPR.1 (-20)", sampleIdent: "LAM/SAM/1/25 (-20)", subCode: "-20", sampleCode: "SMPL-1" },
  },
];

const RECORD = {
  id: "r1",
  labCode: "SPR.1",
  sampleIdent: "LAM/SAM/1/25",
  parentId: null,
  subCode: null,
  sample: { id: "s1", sampleCode: "SMPL-1", status: "PENDING", currentStage: null },
} as unknown as LabRecordListItemDTO;

let requests: string[] = [];
let entries: RecordHistoryEntry[] = ENTRIES;

beforeEach(() => {
  query = new URLSearchParams();
  requests = [];
  entries = ENTRIES;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(String(url));
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            entries,
            pagination: { page: 1, pageSize: 25, total: entries.length, totalPages: 1 },
          },
        }),
      };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(node: React.ReactNode, locale: "en" | "id" = "en", onError: (error: unknown) => void = () => {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} timeZone="Asia/Makassar" onError={onError}>
      {node}
    </NextIntlClientProvider>
  );
}

describe("one sample's history", () => {
  it("reads it for the row it was opened from, and shows who changed what", async () => {
    wrap(<RecordHistoryDialog record={RECORD} onClose={vi.fn()} />);

    expect(await screen.findByText("1.200")).toBeTruthy();
    expect(requests).toEqual(["/api/lab-records/r1/history"]);
    expect(screen.getAllByText("Lab Analyst")).toHaveLength(2);
    expect(screen.getByText("1.350")).toBeTruthy();
    expect(screen.getByText(/Overwrote earlier results/)).toBeTruthy();
    // The sub-sample's change, marked as such.
    expect(screen.getByText(/Sub-sample \(-20\)/)).toBeTruthy();
    // A result that replaced an earlier one stands out.
    expect(screen.getByText("1.200").closest("li")?.className).toContain("amber");
    expect(screen.getByText("22.000").closest("li")?.className).not.toContain("amber");
  });

  it("says so when nothing has changed yet", async () => {
    entries = [];
    wrap(<RecordHistoryDialog record={RECORD} onClose={vi.fn()} />);
    expect(await screen.findByText(en.history.empty)).toBeTruthy();
  });
});

describe("the history page", () => {
  it.each(["en", "id"] as const)("renders with every key resolved in %s", async (locale) => {
    const missing: string[] = [];
    wrap(<ResultsHistory />, locale, (error) => missing.push(String(error)));
    await waitFor(() => expect(screen.getAllByText("Lab Analyst").length).toBeGreaterThan(0));
    expect(missing).toEqual([]);
  });

  it("asks for result changes by default, and for every change when switched", async () => {
    const user = userEvent.setup();
    wrap(<ResultsHistory />);
    await screen.findAllByText("Lab Analyst");
    expect(requests[0]).toBe("/api/lab-records/history?changes=results&page=1");
    // Which sample each change was to.
    expect(screen.getAllByRole("link", { name: "SMPL-1" }).length).toBe(2);

    const replace = vi.spyOn(window.history, "replaceState");
    await user.click(screen.getByRole("button", { name: en.history.allChanges }));
    expect(String(replace.mock.calls.at(-1)?.[2])).toContain("changes=all");
  });

  it("searches by Sample ID once typing pauses", async () => {
    const user = userEvent.setup();
    const replace = vi.spyOn(window.history, "replaceState");
    wrap(<ResultsHistory />);
    await user.type(screen.getByLabelText(en.history.search), "LAM/SAM");
    await waitFor(() => expect(String(replace.mock.calls.at(-1)?.[2])).toContain("search=LAM%2FSAM"));
  });
});
