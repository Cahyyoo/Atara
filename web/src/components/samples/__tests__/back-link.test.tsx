// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { BackLink } from "@/components/samples/back-link";
import { writeSampleOrigin } from "@/lib/sample-origin";

const router = { push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  window.sessionStorage.clear();
  router.push.mockReset();
  router.back.mockReset();
});
afterEach(cleanup);

function show() {
  render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <BackLink />
    </NextIntlClientProvider>
  );
}

describe("BackLink", () => {
  it("returns to the list the sample's pages were opened from, not to the last of them", async () => {
    writeSampleOrigin("/assay?results=missing");
    show();
    await userEvent.setup().click(screen.getByRole("button", { name: en.samples.detail.back }));
    expect(router.push).toHaveBeenCalledWith("/assay?results=missing");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("steps back as before when it does not know where they were opened from", async () => {
    window.history.pushState(null, "", "/samples/SMPL-1");
    show();
    await userEvent.setup().click(screen.getByRole("button", { name: en.samples.detail.back }));
    expect(router.back).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
