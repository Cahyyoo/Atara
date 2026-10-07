// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { MasterDataTables } from "@/components/master/master-data-tables";

const OPTIONS = [
  { id: "p1", kind: "PLACE", code: "LAM", label: null, sortOrder: 0, isActive: true, usageCount: 32 },
  { id: "p2", kind: "PLACE", code: "MOL", label: null, sortOrder: 1, isActive: true, usageCount: 0 },
];

function stubFetch(onPatch?: (body: unknown) => void) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      onPatch?.(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ success: true, data: OPTIONS[1] }) };
    }
    return { ok: true, json: async () => ({ success: true, data: { options: OPTIONS } }) };
  });
}

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <MasterDataTables />
    </NextIntlClientProvider>
  );
}

beforeEach(() => vi.stubGlobal("fetch", stubFetch()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MasterDataTables", () => {
  it("says how many Sample IDs already carry a code", async () => {
    show();
    await waitFor(() => expect(screen.getByText("LAM")).toBeTruthy());
    expect(screen.getByText("in 32 Sample ID(s)")).toBeTruthy();
  });

  it("locks the code of an option something already uses, and says why", async () => {
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(screen.getByText("LAM")).toBeTruthy());

    // The first Edit belongs to LAM, the one with 32 uses.
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    const codeInput = screen.getByDisplayValue("LAM") as HTMLInputElement;
    expect(codeInput.disabled).toBe(true);
    expect(screen.getByText(/cannot be renamed/)).toBeTruthy();
  });

  it("leaves an unused code editable", async () => {
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(screen.getByText("MOL")).toBeTruthy());

    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);

    const codeInput = screen.getByDisplayValue("MOL") as HTMLInputElement;
    expect(codeInput.disabled).toBe(false);
    expect(screen.queryByText(/cannot be renamed/)).toBeNull();
  });

  // The disabled input is a courtesy; not sending the field is what stops a
  // stale edit slipping past, and the server refuses it regardless.
  it("never sends a code for a locked option", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", stubFetch((body) => sent.push(body)));

    const user = userEvent.setup();
    show();
    await waitFor(() => expect(screen.getByText("LAM")).toBeTruthy());

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    // Scoped to the editor row: the five "add new" forms carry the same label.
    const editor = screen.getByDisplayValue("LAM").closest("li")!;
    await user.type(within(editor).getByLabelText("Description (optional)"), "Lamella");
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ label: "Lamella" });
  });
});

describe("deleting a code", () => {
  function stubDelete(preview: object) {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          const body = JSON.parse(String(init.body));
          calls.push({ url: String(url), body });
          const data = body.dryRun ? preview : { deleted: "LAM", moved: 32, replacement: "MOL" };
          return { ok: true, json: async () => ({ success: true, data }) };
        }
        return { ok: true, json: async () => ({ success: true, data: { options: OPTIONS } }) };
      })
    );
    return calls;
  }

  it("deletes an unused code after one confirmation", async () => {
    const calls = stubDelete({});
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole("button", { name: "Delete MOL" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/No Sample ID uses this code/)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Yes, delete MOL" }));

    await waitFor(() => expect(calls).toEqual([{ url: "/api/master-options/p2", body: {} }]));
  });

  it("asks for a replacement for a used code, and shows what it rewrites first", async () => {
    const calls = stubDelete({
      affected: 32,
      examples: [{ labCode: "L-1", from: "LAM/SAM/PA4", to: "MOL/SAM/PA4" }],
      clashes: [],
    });
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole("button", { name: "Delete LAM" }));
    const dialog = await screen.findByRole("dialog");
    const go = within(dialog).getByRole("button", { name: "Replace and delete" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);

    await user.click(within(dialog).getByRole("combobox", { name: "Choose a replacement code" }));
    await user.click(await screen.findByRole("option", { name: "MOL" }));

    expect(await within(dialog).findByText("MOL/SAM/PA4")).toBeTruthy();
    expect(calls[0]).toEqual({
      url: "/api/master-options/p1",
      body: { replacementId: "p2", dryRun: true },
    });

    await user.click(within(dialog).getByRole("button", { name: "Replace and delete" }));
    await user.click(within(dialog).getByRole("button", { name: "Yes, move 32 and delete LAM" }));
    await waitFor(() =>
      expect(calls[1]).toEqual({ url: "/api/master-options/p1", body: { replacementId: "p2" } })
    );
  });

  it("will not go ahead when the rewritten Sample IDs clash", async () => {
    stubDelete({ affected: 32, examples: [], clashes: ["MOL/SAM/PA4"] });
    const user = userEvent.setup();
    show();

    await user.click(await screen.findByRole("button", { name: "Delete LAM" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Choose a replacement code" }));
    await user.click(await screen.findByRole("option", { name: "MOL" }));

    expect(await within(dialog).findByText("MOL/SAM/PA4")).toBeTruthy();
    const go = within(dialog).getByRole("button", { name: "Replace and delete" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
  });
});
