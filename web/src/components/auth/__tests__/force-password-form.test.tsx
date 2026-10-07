// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";
import { ForcePasswordForm } from "@/components/auth/force-password-form";
import { WRONG_PASSWORD_CODE } from "@/lib/session-codes";

const replace = vi.fn();
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push, refresh }) }));

let sent: { url: string; body: unknown }[] = [];
let answer: unknown = { success: true, data: { endedSessions: 0 } };

beforeEach(() => {
  sent = [];
  answer = { success: true, data: { endedSessions: 0 } };
  replace.mockReset();
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return { ok: true, json: async () => answer };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(next: string | null = null, locale: "en" | "id" = "en", onError: (error: unknown) => void = () => {}) {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} onError={onError}>
      <ForcePasswordForm next={next} />
    </NextIntlClientProvider>
  );
}

const t = en.account.password;

async function fill(current: string, password: string, confirm = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(t.current), current);
  await user.type(screen.getByLabelText(t.new), password);
  await user.type(screen.getByLabelText(t.confirm), confirm);
  await user.click(screen.getByRole("button", { name: en.account.forceChange.submit }));
}

describe("ForcePasswordForm", () => {
  it.each(["en", "id"] as const)("renders with every key resolved in %s", (locale) => {
    const missing: string[] = [];
    show(null, locale, (error) => missing.push(String(error)));
    expect(missing).toEqual([]);
  });

  it("offers no way round it but signing out", () => {
    show();
    expect(screen.queryByRole("button", { name: en.common.cancel })).toBeNull();
    expect(screen.getByRole("button", { name: en.account.forceChange.signOut })).toBeTruthy();
  });

  it("checks the new password before sending anything", async () => {
    show();
    await fill("Given1234!", "short");
    expect(screen.getByText(t.tooShort.replace("{min}", "8"))).toBeTruthy();
    expect(sent).toEqual([]);
  });

  it("replaces it, then goes on to where the person was going", async () => {
    show("/assay");
    await fill("Given1234!", "MyOwn1234!");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/assay"));
    expect(sent[0]).toEqual({
      url: "/api/auth/password",
      body: { currentPassword: "Given1234!", newPassword: "MyOwn1234!" },
    });
  });

  it("says so when the current password is wrong", async () => {
    answer = { success: false, error: "x", code: WRONG_PASSWORD_CODE };
    show();
    await fill("nope", "MyOwn1234!");
    expect(await screen.findByText(t.wrongCurrent)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
