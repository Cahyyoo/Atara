// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../../messages/id.json";
import { RolePasswordDefaults } from "@/components/admin/role-password-defaults";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

const STATUS = [
  { role: "ADMIN", isSet: false, updatedAt: null, updatedBy: null },
  { role: "DATABASE", isSet: false, updatedAt: null, updatedBy: null },
  { role: "ANALISIS", isSet: false, updatedAt: null, updatedBy: null },
  { role: "OPERATOR", isSet: true, updatedAt: "2026-10-01T02:00:00.000Z", updatedBy: "Main Admin" },
];

function renderCard() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Makassar">
      <RolePasswordDefaults />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        success: true,
        data:
          init?.method === "PUT"
            ? STATUS.map((entry) =>
                entry.role === "DATABASE"
                  ? { ...entry, isSet: true, updatedAt: "2026-10-07T01:00:00.000Z", updatedBy: "Main Admin" }
                  : entry
              )
            : STATUS,
      }),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RolePasswordDefaults", () => {
  it("says which roles have a default, never what it is", async () => {
    renderCard();
    expect(await screen.findByText(/Diperbarui .* oleh Main Admin/)).toBeTruthy();
    expect(screen.getAllByText("Belum diatur")).toHaveLength(3);
    expect(screen.getAllByText("Sudah diatur")).toHaveLength(1);
  });

  it("checks the two entries agree before saving", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole("button", { name: "Atur password default untuk Database" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Password default"), "Default123!");
    await user.type(within(dialog).getByLabelText("Ulangi password default"), "Default124!");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));

    expect(await within(dialog).findByText("Password tidak sama.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("saves a role's default and shows it as set", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole("button", { name: "Atur password default untuk Database" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Password default"), "Default123!");
    await user.type(within(dialog).getByLabelText("Ulangi password default"), "Default123!");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/role-passwords",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ role: "DATABASE", password: "Default123!" }),
      })
    );
    expect(await screen.findByRole("button", { name: "Atur password default untuk Database" })).toBeTruthy();
    expect(screen.getAllByText("Sudah diatur")).toHaveLength(2);
  });
});
