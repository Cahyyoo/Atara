// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../../messages/id.json";
import { UserMenu } from "@/components/layout/user-menu";
import type { SessionPayload } from "@/lib/auth";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

// A "use server" module cannot be imported into a component test.
const setLocale = vi.fn();
vi.mock("@/app/actions/locale", () => ({
  setLocale: (value: string) => setLocale(value),
}));

const USER: SessionPayload = {
  userId: "u1",
  name: "Main Admin",
  email: "admin@atara.local",
  role: "ADMIN",
  sessionId: "s1",
};

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <UserMenu user={USER} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("shows the signed-in user on the trigger", () => {
    renderMenu();
    expect(screen.getByText("Main Admin")).toBeDefined();
    // Initials, so the avatar is not a broken image.
    expect(screen.getByText("MA")).toBeDefined();
  });

  it("opens without throwing, and shows account, language and sign out", async () => {
    // This is the case a server-rendered HTML check cannot reach: the menu
    // contents only exist once it is opened.
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));

    expect(await screen.findByText("admin@atara.local")).toBeDefined();
    // The role by its name, not the enum it is stored as.
    expect(screen.getByText("Admin")).toBeDefined();
    expect(screen.queryByText("ADMIN")).toBeNull();
    expect(screen.getByText("Bahasa")).toBeDefined();
    expect(screen.getByText("Bahasa Indonesia")).toBeDefined();
    expect(screen.getByText("English")).toBeDefined();
    expect(screen.getByRole("menuitem", { name: /Keluar/ })).toBeDefined();
  });

  it("marks the active language", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));

    const indonesian = await screen.findByRole("menuitemradio", { name: "Bahasa Indonesia" });
    expect(indonesian.getAttribute("aria-checked")).toBe("true");

    const english = screen.getByRole("menuitemradio", { name: "English" });
    expect(english.getAttribute("aria-checked")).toBe("false");
  });

  it("switches language through the server action", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: "English" }));

    await waitFor(() => expect(setLocale).toHaveBeenCalledWith("en"));
  });
});

describe("signing out", () => {
  it("asks for confirmation instead of signing out immediately", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Keluar/ }));

    expect(await screen.findByText("Keluar dari akun?")).toBeDefined();
    // The whole point: nothing has happened yet.
    expect(fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Keluar/ }));
    await user.click(await screen.findByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByText("Keluar dari akun?")).toBeNull());
    expect(fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("signs out only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Keluar/ }));

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Keluar" });
    await user.click(confirm);

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" })
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});

describe("changing the password", () => {
  it("opens the dialog from the menu, and sends the current and new password", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { endedSessions: 1 } }),
    } as Response);
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Ganti password/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Password saat ini"), "old-pass");
    await user.type(within(dialog).getByLabelText("Password baru"), "new-pass1");
    await user.type(within(dialog).getByLabelText("Ulangi password baru"), "new-pass1");
    await user.click(within(dialog).getByRole("button", { name: "Ganti password" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass1" }),
        })
      )
    );
  });

  it("catches a mistyped confirmation before asking the server", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Main Admin/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Ganti password/ }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Password saat ini"), "old-pass");
    await user.type(within(dialog).getByLabelText("Password baru"), "new-pass1");
    await user.type(within(dialog).getByLabelText("Ulangi password baru"), "new-pass2");
    await user.click(within(dialog).getByRole("button", { name: "Ganti password" }));

    expect(await within(dialog).findByText("Password baru tidak sama.")).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
