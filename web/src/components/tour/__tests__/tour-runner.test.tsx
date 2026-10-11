// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { TourRunner, TOUR_FIND_MS } from "@/components/tour/tour-runner";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
}));

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

/** jsdom lays nothing out, so give the tagged elements a box to be "visible". */
function visible(element: HTMLElement) {
  element.getClientRects = () => [{}] as unknown as DOMRectList;
  element.getBoundingClientRect = () =>
    ({ top: 100, left: 100, bottom: 140, right: 300, width: 200, height: 40 }) as DOMRect;
  return element;
}

function page(...targets: string[]) {
  for (const target of targets) {
    const element = document.createElement("button");
    element.dataset.tour = target;
    element.textContent = target;
    document.body.appendChild(visible(element));
  }
}

/** Signed in as the lab admin unless said otherwise; the admin tour is the super admin's. */
const ACCESS = {
  ADMIN: { role: "ADMIN", department: "LAB" },
  OPERATOR: { role: "OPERATOR", department: "LAB" },
  SUPER_ADMIN: { role: "SUPER_ADMIN", department: null },
} as const;

function show(tour: string, role: keyof typeof ACCESS = "ADMIN") {
  search = new URLSearchParams({ tour, keep: "me" });
  window.history.replaceState(null, "", `/dashboard?${search.toString()}`);
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TourRunner access={ACCESS[role]} />
    </NextIntlClientProvider>
  );
}

/**
 * Lets the 150 ms search and the animation frame run. In several rounds:
 * React commits what a timer set only when the act() around it ends, and the
 * frame that measures the element is scheduled by that commit.
 */
async function settle(ms = 400) {
  const rounds = 5;
  for (let round = 0; round < rounds; round++) {
    await act(async () => {
      vi.advanceTimersByTime(ms / rounds);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  // jsdom's animation frames are not driven by the fake clock; these are.
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the tour runner", () => {
  it("highlights the first step's element and walks on with Next", async () => {
    page("quick-search", "help-button");
    show("quickSearch");
    await settle();

    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByText("Find a sample from anywhere")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await settle();
    expect(screen.getByText("Help for this page")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("moves on by itself when the highlighted element is clicked", async () => {
    page("dashboard-range", "dashboard-filters", "dashboard-filter-panel");
    search = new URLSearchParams({ tour: "dashboard", step: "1" });
    window.history.replaceState(null, "", `/dashboard?${search.toString()}`);
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TourRunner access={ACCESS.ADMIN} />
      </NextIntlClientProvider>
    );
    await settle();
    expect(screen.getByText("Open the filters")).toBeTruthy();

    fireEvent.click(document.querySelector('[data-tour="dashboard-filters"]')!);
    // A short pause after the click, then the next element is looked for.
    await settle(1_000);
    expect(screen.getByText("Choose a filter")).toBeTruthy();
  });

  it("says so when an element never appears, and can still go on", async () => {
    show("quickSearch");
    await settle(TOUR_FIND_MS + 400);

    expect(screen.getByText(/This part is not on screen yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("warns on a step that would save data", async () => {
    page("admin-message", "admin-audience", "admin-times", "admin-publish");
    search = new URLSearchParams({ tour: "admin", step: "3" });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TourRunner access={ACCESS.SUPER_ADMIN} />
      </NextIntlClientProvider>
    );
    await settle();
    expect(screen.getByText("Publish")).toBeTruthy();
    expect(screen.getByText(/Saves data/)).toBeTruthy();
  });

  it("does not run a tour the role cannot use", async () => {
    page("users-search");
    show("users", "OPERATOR");
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Esc and takes only itself out of the address", async () => {
    page("quick-search");
    show("quickSearch");
    await settle();

    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(screen.queryByText("Find a sample from anywhere")).toBeNull();
    expect(window.location.search).toBe("?keep=me");
  });

  it("steps aside while the page has its own dialog open", async () => {
    page("quick-search");
    show("quickSearch");
    await settle();
    const card = screen.getByText("Find a sample from anywhere");

    const pageDialog = document.createElement("div");
    pageDialog.setAttribute("role", "dialog");
    document.body.appendChild(pageDialog);
    await settle();
    expect(card.closest("[data-tour-ui]")?.className).toContain("hidden");

    pageDialog.remove();
    await settle();
    expect(card.closest("[data-tour-ui]")?.className).not.toContain("hidden");
  });
});
