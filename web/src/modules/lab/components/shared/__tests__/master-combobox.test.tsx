// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";

import { en } from "@/core/i18n/test-messages";
import { MasterCombobox } from "@/modules/lab/components/shared/master-combobox";
import type { MasterOptionDTO } from "@/modules/lab/types";

/**
 * The identity pickers, Odoo style: searchable, and -- for whoever may add
 * codes -- a code that is not there yet is created from the picker and
 * picked at once.
 */

const OPTIONS: MasterOptionDTO[] = [
  { id: "p1", kind: "PLACE", code: "MOL", label: null, sortOrder: 0, isActive: true },
  { id: "p2", kind: "PLACE", code: "LAM", label: null, sortOrder: 1, isActive: true },
];
const NEW: MasterOptionDTO = { id: "p9", kind: "PLACE", code: "ALG", label: null, sortOrder: 2, isActive: true };

let posts: Record<string, unknown>[] = [];
/** What the server answers the next create with. */
let createStatus = 201;
let listed: MasterOptionDTO[] = OPTIONS;

beforeEach(() => {
  posts = [];
  createStatus = 201;
  listed = OPTIONS;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return createStatus === 201
          ? { ok: true, status: 201, json: async () => ({ success: true, data: { ...NEW, label: body.label ?? null } }) }
          : { ok: false, status: createStatus, json: async () => ({ success: false, error: "That code already exists in this list." }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: { options: listed } }) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const t = en.masterCombobox;

function Harness({ canCreate, onChange }: { canCreate: boolean; onChange: (value: string) => void }) {
  const [value, setValue] = useState("__none__");
  const items: Record<string, string> = {
    __none__: "— Empty —",
    ...Object.fromEntries(OPTIONS.map((option) => [option.id, option.code])),
  };
  return (
    <>
      <label htmlFor="place">Place</label>
      <MasterCombobox
        id="place"
        kind="PLACE"
        value={value}
        items={items}
        options={OPTIONS}
        canCreate={canCreate}
        onValueChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </>
  );
}

function show(canCreate = true) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <Harness canCreate={canCreate} onChange={onChange} />
    </NextIntlClientProvider>
  );
  return onChange;
}

async function search(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("combobox", { name: "Place" }));
  const input = await screen.findByRole("combobox", { name: t.search });
  await user.type(input, text);
}

describe("MasterCombobox", () => {
  it("narrows the list to what is typed, and picks from it", async () => {
    const user = userEvent.setup();
    const onChange = show();
    await search(user, "la");
    expect(screen.queryByRole("option", { name: "MOL" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "LAM" }));
    expect(onChange).toHaveBeenCalledWith("p2");
    expect(screen.getByRole("combobox", { name: "Place" }).textContent).toContain("LAM");
  });

  it("offers no create for a code that already exists", async () => {
    const user = userEvent.setup();
    show();
    await search(user, "mol");
    expect(screen.queryByRole("option", { name: t.create.replace("{code}", "MOL") })).toBeNull();
  });

  it("creates a missing code in the master data and picks it", async () => {
    const user = userEvent.setup();
    const onChange = show();
    await search(user, "alg");
    await user.click(screen.getByRole("option", { name: t.create.replace("{code}", "ALG") }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("p9"));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ kind: "PLACE", code: "ALG" });
  });

  it("gives a code a label first with Create and edit", async () => {
    const user = userEvent.setup();
    const onChange = show();
    await search(user, "alg");
    await user.click(screen.getByRole("option", { name: t.createAndEdit }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText(t.label), "Alang");
    await user.click(dialog.getByRole("button", { name: t.save }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("p9"));
    expect(posts[0]).toMatchObject({ kind: "PLACE", code: "ALG", label: "Alang" });
  });

  it("picks the existing option when someone else added the code a moment ago", async () => {
    const user = userEvent.setup();
    createStatus = 409;
    listed = [...OPTIONS, NEW];
    const onChange = show();
    await search(user, "alg");
    await user.click(screen.getByRole("option", { name: t.create.replace("{code}", "ALG") }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("p9"));
  });

  it("only searches for whoever may not add codes", async () => {
    const user = userEvent.setup();
    show(false);
    await search(user, "alg");
    expect(screen.queryByRole("option", { name: t.createAndEdit })).toBeNull();
    expect(screen.getByText(t.noResults)).toBeTruthy();
  });

  it("refuses a code the Sample ID could not hold", async () => {
    const user = userEvent.setup();
    show();
    await search(user, "a/b");
    expect(screen.queryByRole("option", { name: t.createAndEdit })).toBeNull();
    expect(screen.getByText(t.codeInvalid)).toBeTruthy();
  });
});
