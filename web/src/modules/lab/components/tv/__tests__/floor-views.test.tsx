// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { TvDashboard, TV_REFRESH_MS, formatWait } from "@/modules/lab/components/tv/tv-dashboard";
import { CorrectStageButton } from "@/modules/lab/components/samples/correct-stage-dialog";
import type { StageBoard } from "@/modules/lab/lib/stages/stage-board";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

const BOARD: StageBoard = {
  generatedAt: "2026-10-01T02:00:00.000Z",
  slaHours: 24,
  columns: [
    {
      id: "s2",
      kind: "stage",
      stageKey: "WET_PREP",
      stageName: "WET PREP",
      count: 35,
      overdue: 1,
      cards: [
        { sampleCode: "NKL-2", labCode: "L2", sampleIdent: "MOL/LIM", since: "2026-09-29T02:00:00.000Z", hours: 50, overdue: true },
      ],
    },
    {
      id: "s5",
      kind: "done",
      stageKey: "REPORT",
      stageName: "REPORT",
      count: 4,
      overdue: 0,
      cards: [],
    },
  ],
};

function wrap(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => refresh.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the TV view", () => {
  it("writes waits under two days in hours, and longer ones in days", () => {
    const t = (key: string, values: Record<string, number>) => `${key}:${JSON.stringify(values)}`;
    expect(formatWait(31, t)).toBe('hours:{"hours":31}');
    expect(formatWait(50, t)).toBe('days:{"days":2,"hours":2}');
  });

  it("shows the floor in big numbers and the longest-waiting samples", () => {
    wrap(<TvDashboard initialBoard={BOARD} />);

    expect(screen.getByText("In progress").nextElementSibling?.textContent).toBe("35");
    expect(screen.getByText("Over 24 h").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("NKL-2")).toBeTruthy();
    // Samples not received yet are not on the TV at all.
    expect(screen.queryByText("Not received")).toBeNull();
  });

  it("says so in the middle of the screen when its session ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, json: async () => ({}) })));
    wrap(<TvDashboard initialBoard={BOARD} />);

    await act(async () => {
      vi.advanceTimersByTime(TV_REFRESH_MS);
    });
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/login?next=/tv");
  });
});

describe("correcting a stage", () => {
  it("sends the chosen stage and the reason, after a second confirmation", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return { ok: true, json: async () => ({ success: true, data: {} }) };
      })
    );
    const user = userEvent.setup();
    wrap(
      <CorrectStageButton
        sampleCode="NKL-2"
        currentStageId="s2"
        stages={[
          { id: "s1", key: "RECEIVED", name: "RECEIVED" },
          { id: "s2", key: "WET_PREP", name: "WET PREP" },
          { id: "s3", key: "DRY_PREP", name: "DRY PREP" },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Correct stage" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Move to stage" }));
    // The current stage is not offered.
    expect(screen.queryByRole("option", { name: "WET PREP" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "RECEIVED" }));
    await user.type(within(dialog).getByLabelText("Reason"), "Scanned forward by mistake");

    await user.click(within(dialog).getByRole("button", { name: "Correct stage" }));
    expect(calls).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Yes, move it" }));

    await waitFor(() =>
      expect(calls).toEqual([
        {
          url: "/api/samples/NKL-2/stage",
          body: { stageId: "s1", reason: "Scanned forward by mistake" },
        },
      ])
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
