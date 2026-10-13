// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentType } from "react";

import { en } from "@/core/i18n/test-messages";

/**
 * "Kembali" on a sample's page, with the app served under a sub-path
 * (NEXT_PUBLIC_BASE_PATH=/atara), as it is behind the proxy.
 *
 * The address bar then reads "/atara/lab/assay", and the router adds "/atara"
 * by itself: kept as read, the way back led to "/atara/atara/lab/assay", a page
 * that does not exist -- and a move between one sample's pages was taken for
 * leaving them.
 */

let pathname = "/lab/assay";
const router = { push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => router }));

let Tracker: ComponentType;
let BackLink: ComponentType;
let writeSampleOrigin: (url: string) => void;

beforeAll(async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/atara");
  Tracker = (await import("@/modules/lab/components/shell/sample-origin-tracker")).SampleOriginTracker;
  BackLink = (await import("@/modules/lab/components/samples/back-link")).BackLink;
  writeSampleOrigin = (await import("@/modules/lab/lib/samples/sample-origin")).writeSampleOrigin;
});
afterAll(() => {
  vi.unstubAllEnvs();
  cleanup();
});

/** Moves the address the way the browser shows it: under the base path. */
function go(path: string, rerender: (node: React.ReactNode) => void) {
  fireEvent.pointerDown(document.body);
  window.history.pushState(null, "", `/atara${path}`);
  pathname = path.split("?")[0];
  rerender(<Tracker />);
}

describe("the way back from a sample, under a base path", () => {
  it("leads to the list the sample was opened from, as the router names it", async () => {
    window.sessionStorage.clear();
    pathname = "/lab/assay";
    window.history.pushState(null, "", "/atara/lab/assay?results=missing");
    const { rerender } = render(<Tracker />);

    go("/lab/samples/SMPL-1", rerender);
    // On to a sub-sample and back: still the list, not the sample.
    go("/lab/samples/SMPL-1/sub/-20", rerender);
    go("/lab/samples/SMPL-1", rerender);

    rerender(
      <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
        <BackLink />
      </NextIntlClientProvider>
    );
    await userEvent.setup().click(screen.getByRole("button", { name: en.samples.detail.back }));
    expect(router.push).toHaveBeenCalledWith("/lab/assay?results=missing");
  });

  it("copes with a way back a tab kept from before the fix", async () => {
    cleanup();
    router.push.mockReset();
    writeSampleOrigin("/atara/lab/database?q=1");
    render(
      <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
        <BackLink />
      </NextIntlClientProvider>
    );
    await userEvent.setup().click(screen.getByRole("button", { name: en.samples.detail.back }));
    expect(router.push).toHaveBeenCalledWith("/lab/database?q=1");
  });
});
