// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { id as messages } from "@/core/i18n/test-messages";
import { UsersTable } from "@/modules/system/components/users/users-table";
import type { UserDTO } from "@/modules/system/types";

const BASE: Omit<UserDTO, "id" | "name" | "email"> = {
  role: "PREPARATOR",
  department: "LAB",
  isActive: true,
  lockedUntil: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  _count: { faceEnrollments: 0 },
  totpRequestedAt: null,
  totpEnabledAt: null,
};

const USERS: UserDTO[] = [
  {
    ...BASE,
    id: "admin",
    name: "Main Admin",
    email: "admin@atara.local",
    role: "ADMIN",
    _count: { faceEnrollments: 5 },
    totpRequestedAt: "2026-09-01T00:00:00.000Z",
    totpEnabledAt: "2026-09-02T00:00:00.000Z",
  },
  { ...BASE, id: "op", name: "Field Operator", email: "operator@atara.local" },
  {
    ...BASE,
    id: "pending",
    name: "QA Pending",
    email: "qa@atara.local",
    isActive: false,
    totpRequestedAt: "2026-09-20T00:00:00.000Z",
  },
];

function renderTable() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Makassar">
      <UsersTable currentUserId="admin" manager={{ role: "ADMIN", department: "LAB" }} />
    </NextIntlClientProvider>
  );
}

/** Which roles have a default password, as the server reports it. */
let defaultsSet = ["PREPARATOR"];

beforeEach(() => {
  defaultsSet = ["PREPARATOR"];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/role-passwords") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: ["ADMIN", "DATABASE", "ANALISIS", "PREPARATOR"].map((role) => ({
              role,
              isSet: defaultsSet.includes(role),
              updatedAt: null,
              updatedBy: null,
            })),
          }),
        };
      }
      if (url.endsWith("/reset-password") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ success: true, data: { ...USERS[1], mustChangePassword: true } }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { users: USERS, pagination: { page: 1, pageSize: 50, total: USERS.length, totalPages: 1 } },
        }),
      };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function row(name: string) {
  const cell = await screen.findByText(name);
  return cell.closest("tr") as HTMLElement;
}

describe("UsersTable", () => {
  it("gives every row the same two actions, so they line up", async () => {
    renderTable();
    for (const user of USERS) {
      const buttons = within(await row(user.name)).getAllByRole("button");
      expect(buttons.map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual([
        "Ubah",
        `Aksi lain untuk ${user.name}`,
      ]);
    }
  });

  it("shows the email with the name instead of in a column of its own", async () => {
    renderTable();
    expect(within(await row("Field Operator")).getByText("operator@atara.local")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Email" })).toBeNull();
  });

  it("names the role instead of printing the enum", async () => {
    renderTable();
    expect(within(await row("Main Admin")).getByText("Admin Lab")).toBeTruthy();
    expect(within(await row("Field Operator")).getByText("Preparator")).toBeTruthy();
    expect(screen.queryByText("ADMIN")).toBeNull();
  });

  it("shows each account's second factors", async () => {
    renderTable();
    const admin = within(await row("Main Admin"));
    expect(admin.getByText("Wajah")).toBeTruthy();
    expect(admin.getByText("Authenticator")).toBeTruthy();
    expect(within(await row("Field Operator")).getByText("Kata sandi saja")).toBeTruthy();
    expect(within(await row("QA Pending")).getByText("Authenticator (menunggu)")).toBeTruthy();
  });

  it("offers re-enrolment and removal for an enrolled face", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(await screen.findByRole("button", { name: "Aksi lain untuk Main Admin" }));

    expect(await screen.findByRole("menuitem", { name: "Daftar ulang" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Hapus data wajah" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Kelola Authenticator…" })).toBeTruthy();
  });

  it("offers only enrolment where there is no face to remove", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(await screen.findByRole("button", { name: "Aksi lain untuk Field Operator" }));

    expect(await screen.findByRole("menuitem", { name: "Daftarkan wajah" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Hapus data wajah" })).toBeNull();
  });

  it("opens the authenticator dialog from the menu", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(await screen.findByRole("button", { name: "Aksi lain untuk Field Operator" }));
    await user.click(await screen.findByRole("menuitem", { name: "Kelola Authenticator…" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Microsoft Authenticator")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Wajibkan Authenticator" })).toBeTruthy();
  });

  it("resets somebody else's password to the role default, after a confirmation", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(await screen.findByRole("button", { name: "Aksi lain untuk Field Operator" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset ke password default" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Field Operator dikembalikan ke password default role Preparator/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Reset password" }));

    expect(fetch).toHaveBeenCalledWith("/api/users/op/reset-password", { method: "POST" });
    expect(await within(await row("Field Operator")).findByText("Wajib ganti password")).toBeTruthy();
  });

  it("does not offer a reset on one's own account", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(await screen.findByRole("button", { name: "Aksi lain untuk Main Admin" }));
    await screen.findByRole("menuitem", { name: "Kelola Authenticator…" });
    expect(screen.queryByRole("menuitem", { name: "Reset ke password default" })).toBeNull();
  });
});

describe("Adding a user", () => {
  it("asks for no password: the account starts on the role default", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(await screen.findByRole("button", { name: "Tambah Pengguna" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
    expect(await within(dialog).findByText(/password default role Preparator/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Buat Pengguna" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("will not create an account for a role without a default", async () => {
    defaultsSet = [];
    const user = userEvent.setup();
    renderTable();
    await user.click(await screen.findByRole("button", { name: "Tambah Pengguna" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Role Preparator belum punya password default.")).toBeTruthy();
    expect(
      within(dialog).getByRole("link", { name: "Atur di bagian bawah halaman ini" }).getAttribute("href")
    ).toBe("#role-passwords");
    expect((within(dialog).getByRole("button", { name: "Buat Pengguna" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
