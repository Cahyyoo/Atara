// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";
import { AUTO_REFRESH_MS, DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { dashboardLayoutFor } from "@/lib/dashboard-layout";
import type { AnalyticsResult } from "@/lib/analytics";

const OPTIONS = [
  { id: "place-mol", kind: "PLACE", code: "MOL", label: null, sortOrder: 0, isActive: true, usageCount: 3 },
  { id: "pit-a4", kind: "PIT", code: "A4", label: null, sortOrder: 0, isActive: true, usageCount: 3 },
  // Retired, but it can still be the filter that is applied.
  { id: "rock-sap", kind: "ROCK_TYPE", code: "SAP", label: null, sortOrder: 0, isActive: false, usageCount: 1 },
];

const ANALYTICS = {
  range: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-18T00:00:00.000Z" },
  generatedAt: "2026-09-18T02:30:00.000Z",
  kpi: { total: 0, inProgress: 0, completed: 0, awaitingAssay: 0, overdue: 0, averageCycleHours: null },
  statusSplit: [],
  throughput: [],
  stageDurations: [],
  bottleneck: [],
  niDistribution: [],
  placeSplit: [],
  overdueSamples: [],
} as unknown as AnalyticsResult;

/** Every analytics URL the page asked for, in order. */
let asked: string[] = [];

function stubFetch() {
  return vi.fn(async (url: string) => {
    if (String(url).startsWith("/api/master-options")) {
      return { ok: true, json: async () => ({ success: true, data: { options: OPTIONS } }) };
    }
    asked.push(String(url));
    return { ok: true, json: async () => ({ success: true, data: ANALYTICS }) };
  });
}

function show(locale: "en" | "id" = "en", onError: (e: unknown) => void = () => {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} onError={onError}>
      <DashboardOverview layout={dashboardLayoutFor("LAB_ADMIN")} initialAnalytics={ANALYTICS} />
    </NextIntlClientProvider>
  );
}

/** Opens the panel if it is shut, then picks from one of the five pickers. */
async function pick(user: ReturnType<typeof userEvent.setup>, trigger: RegExp, option: string) {
  const toggle = screen.getByRole("button", { name: /Filters|Saringan/ });
  if (toggle.getAttribute("aria-expanded") !== "true") await user.click(toggle);

  await user.click(await screen.findByRole("combobox", { name: trigger }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/**
 * The chip, found by its own remove button. Scoped deliberately: the code also
 * appears on the picker's trigger once it is chosen, so a bare text query would
 * match either and prove neither.
 */
function chip(name: string | RegExp) {
  return screen.queryByRole("button", { name: typeof name === "string" ? new RegExp(name) : name });
}

beforeEach(() => {
  asked = [];
  vi.stubGlobal("fetch", stubFetch());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard filters", () => {
  it("shows no chips and no count until something is filtered", async () => {
    show();
    const button = await screen.findByRole("button", { name: /Filters/ });

    expect(button.textContent).toBe("Filters");
    expect(screen.queryByText("MOL")).toBeNull();
  });

  it("names an applied filter by its code, not by its kind or its id", async () => {
    const user = userEvent.setup();
    show();

    await pick(user, /All Place/, "MOL");

    // The chip has to say what is filtered. "Place" alone says nothing, and a
    // cuid says less.
    await waitFor(() => expect(chip("Remove the Place filter")).toBeTruthy());
    expect(chip("Remove the Place filter")!.textContent).toContain("MOL");
    expect(document.body.textContent).not.toContain("place-mol");
  });

  it("keeps the chip visible even while the panel is closed", async () => {
    const user = userEvent.setup();
    show();

    await pick(user, /All Place/, "MOL");
    await user.click(screen.getByRole("button", { name: /Filters/ }));

    expect(screen.queryByRole("combobox", { name: /All Place/ })).toBeNull();
    expect(chip("Remove the Place filter")!.textContent).toContain("MOL");
  });

  it("stops sending the parameter once its chip is dismissed", async () => {
    const user = userEvent.setup();
    show();

    await pick(user, /All Place/, "MOL");
    await waitFor(() => expect(asked.some((url) => url.includes("placeId=place-mol"))).toBe(true));

    await user.click(screen.getByRole("button", { name: /Remove the Place filter/ }));

    // Proved by what was requested, not by what disappeared from the screen.
    await waitFor(() => expect(asked[asked.length - 1]).not.toContain("placeId"));
    expect(chip("Remove the Place filter")).toBeNull();
  });

  it("clears every chip at once on reset", async () => {
    const user = userEvent.setup();
    show();

    await pick(user, /All Place/, "MOL");
    await pick(user, /All Pit Location/, "A4");
    await waitFor(() => expect(chip("Remove the Pit Location filter")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Last .* days/ }));

    await waitFor(() => expect(chip("Remove the Place filter")).toBeNull());
    expect(chip("Remove the Pit Location filter")).toBeNull();
  });

  // The needs-attention table only appears when something is overdue, which is
  // why it could not be checked on a live page — nothing was.
  it("names the sample in the needs-attention table, and dashes when it has none", () => {
    const withOverdue = {
      ...ANALYTICS,
      kpi: { ...ANALYTICS.kpi, overdue: 2 },
      overdueSamples: [
        {
          sampleCode: "NKL-2026-00060",
          labCode: "SPR.QLAB.20260918.004",
          sampleIdent: "LAM/LIM/BG/S1/PA4/B489/11.1/18",
          stageName: "Drying",
          hoursInStage: 30,
          slaHours: 24,
        },
        {
          sampleCode: "NKL-2026-00061",
          labCode: "SPR.QLAB.20260918.005",
          sampleIdent: null,
          stageName: "Drying",
          hoursInStage: 26,
          slaHours: 24,
        },
      ],
    } as unknown as AnalyticsResult;

    render(
      <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
        <DashboardOverview layout={dashboardLayoutFor("LAB_ADMIN")} initialAnalytics={withOverdue} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText("LAM/LIM/BG/S1/PA4/B489/11.1/18")).toBeTruthy();

    // The row with no identity has to stay legible rather than render a blank
    // cell or the word "null".
    const row = screen.getByText("NKL-2026-00061").closest("tr")!;
    expect(row.textContent).toContain("—");
    expect(row.textContent).not.toContain("null");
  });

  it.each(["en", "id"] as const)("resolves every label in %s", async (locale) => {
    const missing: string[] = [];
    const user = userEvent.setup();
    show(locale, (error) => missing.push(String(error)));

    await user.click(screen.getByRole("button", { name: /Filters|Saringan/ }));
    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0));

    expect(missing).toEqual([]);
  });
});

describe("dashboard auto-refresh", () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it("asks for the same window again once a minute, and not before", async () => {
    show();
    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_MS - 1_000);
    });
    expect(asked).toEqual([]);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    await waitFor(() => expect(asked).toEqual(["/api/analytics?"]));
  });

  it("stays quiet in a hidden tab, and catches up when it is looked at again", async () => {
    show();
    setHidden(true);
    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_MS * 3);
    });
    expect(asked).toEqual([]);

    setHidden(false);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(asked).toEqual(["/api/analytics?"]));
  });

  it("says when the figures were worked out", async () => {
    show();
    // 02:30 UTC is 10:30 WITA; a past day, so the date is shown too.
    expect(await screen.findByText(/Updated 2026-09-18 10:30/)).toBeTruthy();
  });
});

describe("dashboard summary download", () => {
  it("is offered only where the role may export", () => {
    const { unmount } = show();
    expect(screen.queryByRole("button", { name: /Download summary/ })).toBeNull();
    unmount();

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DashboardOverview
          layout={dashboardLayoutFor("DATABASE")}
          initialAnalytics={ANALYTICS}
          canDownloadReport
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole("button", { name: /Download summary/ })).toBeTruthy();
  });
});
