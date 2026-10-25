// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { CrmTable } from "@/modules/eksplorasi/components/crm/crm-table";
import { CRM_COLUMNS, type CrmKind } from "@/modules/eksplorasi/lib/crm-list-columns";
import type { CrmRowDTO } from "@/modules/eksplorasi/types";

const STANDARD: CrmRowDTO = {
  id: "s1",
  updatedAt: "2026-10-25T00:00:00.000Z",
  ...Object.fromEntries(CRM_COLUMNS.standard.map((column) => [column.field, null])),
  standard: "Oreas182",
  testMethod: "Fusion XRF",
  ni: "0.71",
  sdNi: "0.0080",
};

/** What the list answers; set per test. */
let rows: CrmRowDTO[] = [];
const requests: { url: string; method: string; body: unknown }[] = [];

beforeEach(() => {
  rows = [];
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === "GET") return { ok: true, status: 200, json: async () => ({ success: true, data: rows }) };
      if (method === "POST") {
        return { ok: true, status: 201, json: async () => ({ success: true, data: { ...STANDARD, id: "new" } }) };
      }
      if (method === "DELETE") return { ok: true, status: 200, json: async () => ({ success: true, data: { id: "s1" } }) };
      return { ok: false, status: 409, json: async () => ({ success: false, error: "That value is already taken." }) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(kind: CrmKind = "standard") {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <CrmTable kind={kind} />
    </NextIntlClientProvider>
  );
}

describe("a CRM table", () => {
  it("heads its columns as the lab's sheet does, and says when it is empty", async () => {
    show("duplicate");
    expect(await screen.findByText(en.crmList.empty)).toBeTruthy();
    const headings = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headings.slice(0, 4)).toEqual(["Duplicate", "R²", "RPD %", ">10% RPD"]);
  });

  it("shows each row's values as written", async () => {
    rows = [STANDARD];
    show();
    await waitFor(() => screen.getByText("Oreas182"));
    const cells = [...screen.getAllByRole("row")[1].querySelectorAll("td")].map((td) => td.textContent);
    expect(cells.slice(0, 3)).toEqual(["Oreas182", "Fusion XRF", "0.71"]);
    expect(cells).toContain("0.0080");
  });

  it("adds a row from the dialog, sending blank boxes as nothing", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText(en.crmList.empty);

    await user.click(screen.getByRole("button", { name: en.crmList.add }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Standart/), "Oreas199");
    await user.type(within(dialog).getByLabelText(/Test Method/), "Fusion ICP");
    await user.type(within(dialog).getByLabelText(/^Ni$/), "1.5");
    await user.click(within(dialog).getByRole("button", { name: en.crmList.dialog.save }));

    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const sent = requests.find((request) => request.method === "POST")!;
    expect(sent.url).toBe("/api/crm-list/standard");
    expect(sent.body).toMatchObject({ standard: "Oreas199", testMethod: "Fusion ICP", ni: "1.5", co: null });
  });

  it("asks before deleting a row, then deletes it", async () => {
    const user = userEvent.setup();
    rows = [STANDARD];
    show();
    await waitFor(() => screen.getByText("Oreas182"));

    await user.click(screen.getByRole("button", { name: `${en.crmList.delete} Oreas182 · Fusion XRF` }));
    const confirm = await screen.findByRole("dialog");
    expect(confirm.textContent).toContain("Oreas182 · Fusion XRF");
    await user.click(within(confirm).getByRole("button", { name: en.crmList.deleteDialog.action }));

    await waitFor(() =>
      expect(requests.find((request) => request.method === "DELETE")?.url).toBe("/api/crm-list/standard/s1")
    );
  });
});
