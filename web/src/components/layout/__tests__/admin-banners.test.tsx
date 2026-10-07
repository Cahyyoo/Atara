// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { WelcomeDialog } from "@/components/layout/welcome-dialog";
import type { AnnouncementDTO } from "@/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const base: AnnouncementDTO = {
  id: "info-1",
  message: "XRF maintenance tomorrow",
  tone: "INFO",
  roles: null,
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: null,
  createdBy: "Main Admin",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function wrap(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the announcement banner", () => {
  it("lets an info line be closed, and keeps it closed", async () => {
    const user = userEvent.setup();
    const { unmount } = wrap(<AnnouncementBanner announcements={[base]} />);

    await user.click(screen.getByRole("button", { name: "Close this announcement" }));
    expect(screen.queryByText("XRF maintenance tomorrow")).toBeNull();

    unmount();
    wrap(<AnnouncementBanner announcements={[base]} />);
    expect(screen.queryByText("XRF maintenance tomorrow")).toBeNull();
  });

  it("keeps a warning up, with no way to close it", () => {
    wrap(<AnnouncementBanner announcements={[{ ...base, id: "warn-1", tone: "WARNING" }]} />);
    expect(screen.getByRole("alert").textContent).toContain("XRF maintenance tomorrow");
    expect(screen.queryByRole("button", { name: "Close this announcement" })).toBeNull();
  });
});

describe("the welcome guide", () => {
  it("walks through the role's steps and records that it was seen", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    wrap(<WelcomeDialog role="OPERATOR" name="Budi" />);

    expect(screen.getByText(/Welcome, Budi/)).toBeTruthy();
    expect(screen.getByText("You move the samples")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Help is always here")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/guide-seen", { method: "POST" }));
  });

  it("can go straight into the dashboard's guided tour", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    push.mockClear();
    const user = userEvent.setup();
    wrap(<WelcomeDialog role="OPERATOR" name="Budi" />);

    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Start the tour" }));

    expect(push).toHaveBeenCalledWith("/dashboard?tour=dashboard");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/guide-seen", { method: "POST" }));
  });
});
