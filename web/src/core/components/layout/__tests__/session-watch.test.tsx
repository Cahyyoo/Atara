// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { SessionWatch, isSessionRefusal } from "@/core/components/layout/session-watch";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  usePathname: () => "/lab/assay",
}));

const ORIGIN = "http://localhost";

describe("which refusals speak for the session", () => {
  it("is a 401 from this app's own API", () => {
    expect(isSessionRefusal("/api/samples", 401, ORIGIN)).toBe(true);
    expect(isSessionRefusal(new URL("/api/users", ORIGIN), 401, ORIGIN)).toBe(true);
  });

  it("is not any other status, another origin, a page, or the session's own requests", () => {
    expect(isSessionRefusal("/api/samples", 403, ORIGIN)).toBe(false);
    expect(isSessionRefusal("https://elsewhere.example/api/x", 401, ORIGIN)).toBe(false);
    expect(isSessionRefusal("/lab/assay", 401, ORIGIN)).toBe(false);
    expect(isSessionRefusal("/api/auth/session", 401, ORIGIN)).toBe(false);
    expect(isSessionRefusal("/api/auth/logout", 401, ORIGIN)).toBe(false);
  });
});

describe("a session ended while the page is open", () => {
  let sessionAnswer: { status: number; body: unknown };
  /** The network itself; SessionWatch's watch sits in front of it once mounted. */
  let stub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionAnswer = {
      status: 401,
      body: { success: false, code: "session-ended", details: { reason: "ADMIN_ENDED", at: "2026-10-25T03:00:00.000Z" } },
    };
    stub = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/auth/session")) {
          return new Response(JSON.stringify(sessionAnswer.body), { status: sessionAnswer.status });
        }
        // Any other API call: refused, as every route is once the session is over.
        return new Response(JSON.stringify({ success: false, error: "You must be signed in." }), { status: 401 });
      });
    vi.stubGlobal("fetch", stub);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function show() {
    return render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
        <SessionWatch sessionId="s1" />
      </NextIntlClientProvider>
    );
  }

  /** How many times the session was asked about, as the network saw it. */
  const sessionChecks = () => stub.mock.calls.filter(([input]) => String(input).includes("/api/auth/session")).length;

  it("asks at the first refused request, not at the next poll", async () => {
    show();
    expect(sessionChecks()).toBe(0);

    // Any screen's own call, made the ordinary way.
    const answer = await window.fetch("/api/samples");
    // Handed back to its caller untouched.
    expect(answer.status).toBe(401);

    await waitFor(() => expect(sessionChecks()).toBe(1));
    // And the reason is shown at once.
    await waitFor(() => expect(document.body.textContent).toContain(en.session.endedByAdminTitle));
  });

  it("does not ask for a request that was not refused", async () => {
    stub.mockImplementationOnce(async () => new Response("{}", { status: 200 }));
    show();
    await window.fetch("/api/samples");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sessionChecks()).toBe(0);
  });

  it("puts fetch back when it goes", async () => {
    const before = window.fetch;
    const { unmount } = show();
    expect(window.fetch).not.toBe(before);
    unmount();
    expect(window.fetch).toBe(before);
  });
});
