// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../../messages/en.json";
import { QuickSearch } from "@/components/layout/quick-search";
import type { SampleLookupDTO } from "@/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const HITS: SampleLookupDTO[] = [
  { sampleCode: "AT0001", labCode: "L-01", sampleIdent: "MOL-SAP-A4", status: "IN_PROGRESS", stageKey: "WET_PREP", stageName: "WET PREP" },
  { sampleCode: "AT0002", labCode: "L-02", sampleIdent: null, status: "PENDING", stageKey: null, stageName: null },
];

let asked: string[] = [];

beforeEach(() => {
  asked = [];
  push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));
      const q = new URL(String(url), "http://x").searchParams.get("q") ?? "";
      const results = HITS.filter((hit) => hit.sampleCode.toLowerCase().startsWith(q.toLowerCase()));
      return { ok: true, json: async () => ({ success: true, data: { results } }) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QuickSearch />
      <input aria-label="elsewhere" />
    </NextIntlClientProvider>
  );
}

describe("quick search", () => {
  it("opens on Ctrl+K from anywhere", async () => {
    const user = userEvent.setup();
    show();
    expect(screen.queryByRole("combobox")).toBeNull();

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("combobox")).toBeTruthy();
  });

  it("leaves '/' alone while somebody is typing in another field", async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByLabelText("elsewhere"));
    await user.keyboard("/");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("asks once after a pause, and opens the chosen sample with the arrow keys", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Search samples…" }));

    await user.type(await screen.findByRole("combobox"), "AT");
    expect(await screen.findByText("AT0002")).toBeTruthy();
    expect(asked).toEqual(["/api/samples/lookup?q=AT"]);
    // The stage by its translated name, or the status when it has none yet.
    expect(screen.getByText("WET PREP")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/samples/AT0002");
  });

  it("opens an exact scan straight away, without waiting for the pause", async () => {
    const user = userEvent.setup();
    show();
    await user.keyboard("{Control>}k{/Control}");

    await user.type(await screen.findByRole("combobox"), "AT0001{Enter}");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/samples/AT0001"));
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    show();
    await user.keyboard("{Control>}k{/Control}");

    await user.type(await screen.findByRole("combobox"), "ZZ");
    expect(await screen.findByText("No sample matches.")).toBeTruthy();
  });
});
