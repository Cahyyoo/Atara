// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../../../../messages/en.json";
import GenerateSamplePage from "@/app/(app)/lab/samples/generate/page";

/** Printing opens a browser dialog jsdom has no business running. */
vi.mock("react-to-print", () => ({ useReactToPrint: () => vi.fn() }));

function sample(code: string) {
  return {
    id: `id-${code}`,
    sampleCode: code,
    status: "PENDING",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    currentStage: null,
    labRecord: { labCode: `SPR.QLAB.20260920.${code.slice(-3)}` },
  };
}

/** Each generate answers with the next batch in this queue. */
let batches: ReturnType<typeof sample>[][] = [];

function stubFetch() {
  return vi.fn(async (url: string) => {
    if (String(url).startsWith("/api/master-options")) {
      return { ok: true, json: async () => ({ success: true, data: { options: [] } }) };
    }
    if (String(url).startsWith("/api/samples/generate")) {
      return { ok: true, json: async () => ({ success: true, data: batches.shift() ?? [] }) };
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <GenerateSamplePage />
    </NextIntlClientProvider>
  );
}

const formTitle = en.samples.generate.formTitle;
const previewTitle = en.samples.generate.previewTitle;

/**
 * A sample code is on screen twice once its label is previewed: once in the
 * list of tick boxes and once printed under its own QR. Counting rather than
 * fetching one keeps that from reading as an ambiguous-match failure.
 */
function timesOnScreen(code: string): number {
  return screen.queryAllByText(code).length;
}

function onForm(): boolean {
  return screen.queryByText(formTitle) !== null;
}

/** An identity is optional, so a barcode can be generated without touching one. */
async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Generate/ }));
}

beforeEach(() => {
  batches = [
    [sample("NKL-2026-00001"), sample("NKL-2026-00002")],
    [sample("NKL-2026-00003")],
  ];
  vi.stubGlobal("fetch", stubFetch());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the generate page", () => {
  it("shows only the form before anything is generated", () => {
    show();

    expect(onForm()).toBe(true);
    expect(screen.queryByText(/Barcodes Just Created/)).toBeNull();
    expect(screen.queryByText(previewTitle)).toBeNull();
  });

  // The change asked for: the finished form gives up its place rather than
  // sitting above the result the operator came for.
  it("replaces the form with the labels once the barcodes exist", async () => {
    const user = userEvent.setup({ delay: null });
    show();

    await generate(user);

    await waitFor(() => expect(screen.getByText(/Barcodes Just Created \(2\)/)).toBeTruthy());
    expect(onForm()).toBe(false);
    expect(screen.getByText(previewTitle)).toBeTruthy();
    // Listed, and again on the label that is about to be printed.
    expect(timesOnScreen("NKL-2026-00001")).toBe(2);
  });

  it("goes back to an empty form, and back again to the labels", async () => {
    const user = userEvent.setup({ delay: null });
    show();

    await generate(user);
    await waitFor(() => expect(onForm()).toBe(false));

    await user.click(screen.getByRole("button", { name: en.samples.generate.backToForm }));
    expect(onForm()).toBe(true);
    expect(screen.queryByText(/Barcodes Just Created/)).toBeNull();

    // Without this way back, one mistaken click would strand the batch until
    // the next generate overwrote it.
    await user.click(screen.getByRole("button", { name: /View the 2 barcode/ }));
    expect(screen.getByText(/Barcodes Just Created \(2\)/)).toBeTruthy();
    expect(onForm()).toBe(false);
  });

  /**
   * The behaviour chosen over accumulating: this screen is the batch just made.
   * The first batch's codes must be gone, not merely further down the list.
   */
  it("starts the list from scratch on the next generate", async () => {
    const user = userEvent.setup({ delay: null });
    show();

    await generate(user);
    await waitFor(() => expect(timesOnScreen("NKL-2026-00001")).toBe(2));

    await user.click(screen.getByRole("button", { name: en.samples.generate.backToForm }));
    await generate(user);

    await waitFor(() => expect(screen.getByText(/Barcodes Just Created \(1\)/)).toBeTruthy());
    expect(timesOnScreen("NKL-2026-00003")).toBe(2);
    expect(timesOnScreen("NKL-2026-00001")).toBe(0);
    expect(timesOnScreen("NKL-2026-00002")).toBe(0);
  });

  it("offers no way back to a batch that was never made", () => {
    show();
    expect(screen.queryByRole("button", { name: /View the/ })).toBeNull();
  });
});
