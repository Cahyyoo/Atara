// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { GenerateForm, MAX_BARCODES, parseQuantity } from "@/components/samples/generate-form";

let sent: { identities: object[] }[] = [];

function stubFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/samples/generate")) {
      sent.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

function show(onGenerated = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <GenerateForm onGenerated={onGenerated} />
    </NextIntlClientProvider>
  );
  return onGenerated;
}

const quantityBox = () => screen.getByLabelText(en.samples.generate.quantity) as HTMLInputElement;
const submit = () => screen.getByRole("button", { name: /Generate/ }) as HTMLButtonElement;

beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", stubFetch());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("parseQuantity", () => {
  it("takes a whole number from 1 to the ceiling, and nothing else", () => {
    expect(parseQuantity("1")).toBe(1);
    expect(parseQuantity(" 25 ")).toBe(25);
    expect(parseQuantity(String(MAX_BARCODES))).toBe(MAX_BARCODES);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity(String(MAX_BARCODES + 1))).toBeNull();
    expect(parseQuantity("2.5")).toBeNull();
    expect(parseQuantity("ten")).toBeNull();
    expect(parseQuantity("")).toBeNull();
  });
});

describe("GenerateForm", () => {
  it("asks only how many, and makes that many barcodes without an identity", async () => {
    const user = userEvent.setup();
    const onGenerated = show();

    // No identity fields: the Sample ID is filled in later, in the Database.
    expect(document.querySelectorAll('[id^="ident-"]')).toHaveLength(0);

    await user.clear(quantityBox());
    await user.type(quantityBox(), "3");
    expect(submit().textContent).toContain("Generate 3 barcodes");
    await user.click(submit());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].identities).toEqual([{}, {}, {}]);
    expect(onGenerated).toHaveBeenCalled();
    // Back to one for the next batch.
    await waitFor(() => expect(quantityBox().value).toBe("1"));
  });

  it("will not submit a quantity outside 1 to 500", async () => {
    const user = userEvent.setup();
    show();

    await user.clear(quantityBox());
    await user.type(quantityBox(), "501");
    expect(submit().disabled).toBe(true);

    await user.clear(quantityBox());
    await user.type(quantityBox(), "0");
    expect(submit().disabled).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("points to the Database, where the identity is filled in", () => {
    show();
    const link = screen.getByRole("link", { name: en.samples.generate.openDatabase });
    expect(link.getAttribute("href")).toBe("/lab/database?ident=missing");
  });
});
