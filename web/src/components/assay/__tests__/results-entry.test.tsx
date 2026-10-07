// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { ResultsEntry } from "@/components/assay/results-entry";
import { resetPersistedColumns } from "@/hooks/use-persisted-columns";
import { ASSAY_FIELDS } from "@/lib/assay";
import type { LabRecordListItemDTO } from "@/types";

function record(n: number, extra: Record<string, unknown> = {}) {
  return {
    ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, null])),
    id: `r${n}`,
    labCode: `SPR.QLAB.20260918.00${n}`,
    sampleIdent: null,
    shiftDate: "2026-09-18",
    remarks: null,
    measurementMethod: null,
    solutionId: null,
    measurementFinished: null,
    sample: { id: `s${n}`, sampleCode: `NKL-2026-0000${n}`, status: "PENDING", currentStage: null },
    ...extra,
  } as unknown as LabRecordListItemDTO;
}

// The second one carries a value in a column the grid does not show. Solution
// ID rather than Zn: Zn is an assay column, and those are all on screen now.
const RECORDS = [record(1), record(2, { solutionId: "866" })];

let saves: { records: Record<string, unknown>[] }[] = [];
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  saves = [];
  window.localStorage.clear();
  resetPersistedColumns();
  fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
    saves.push(JSON.parse(String(init?.body)));
    return { ok: true, json: async () => ({ success: true, data: { updated: 1, submitted: 1 } }) };
  });
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(onDone = vi.fn(), records = RECORDS) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <ResultsEntry records={records} onDone={onDone} />
    </NextIntlClientProvider>
  );
  return onDone;
}

const cell = (sample: string, field: string) =>
  screen.getByRole("textbox", { name: `${sample} ${field}` }) as HTMLInputElement;

describe("typing results for the ticked samples", () => {
  it("shows only the samples it was handed, and loads nothing", () => {
    show();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getAllByRole("region")).toHaveLength(RECORDS.length);
  });

  it("gives a few samples a form, with every assay box on screen at once", () => {
    /**
     * Eighteen columns in a row is right for twenty samples and wrong for
     * one: a single row stretched across two screens' width while the page
     * below it sat empty, so filling in one result meant scrolling back and
     * forth past everything already typed.
     *
     * The instrument's three columns and the remarks box stay off, so the
     * count here is the assay fields exactly.
     */
    show();

    expect(screen.queryByRole("table")).toBeNull();
    const first = screen.getAllByRole("region")[0];
    expect(within(first).getAllByRole("textbox")).toHaveLength(ASSAY_FIELDS.length);
  });

  it("gives many samples the grid, where a column can be read down", () => {
    // The sideways scroll earns itself once there are rows to compare.
    show(vi.fn(), [record(1), record(2), record(3), record(4)]);

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });

  it("keeps Enter stepping to the same field in the next sample", () => {
    // The form reuses the grid's cell ids for this: a card is a row as far
    // as moving between them is concerned, so typing Ni for three samples
    // is still number, Enter, number, Enter.
    show();

    const first = cell("NKL-2026-00001", "Ni");
    const second = cell("NKL-2026-00002", "Ni");
    expect(first.id).not.toBe(second.id);
    expect(second.id).toBe(first.id.replace(/-0-/, "-1-"));
  });
  it("takes a comma as the decimal mark and saves with Ctrl+S", async () => {
    const user = userEvent.setup({ delay: null });
    show();

    await user.type(cell("NKL-2026-00001", "Ni"), "1,86");
    expect(screen.getByText("1 row(s) changed")).toBeTruthy();
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].records).toHaveLength(1);
    expect(saves[0].records[0]).toMatchObject({ id: "r1", ni: 1.86 });
  });

  it("keeps a hidden column's value when saving", async () => {
    // Solution ID is not on screen, and saving a row must not blank it.
    // Anything the grid does not show, it is holding rather than editing.
    const user = userEvent.setup({ delay: null });
    show();

    await user.type(cell("NKL-2026-00002", "Ni"), "2");
    await user.click(screen.getByRole("button", { name: /Save 1 row/ }));

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0].records[0]).toMatchObject({ id: "r2", ni: 2, solutionId: "866" });
  });

  it("marks an impossible value and will not save it", async () => {
    const user = userEvent.setup({ delay: null });
    show();

    const ni = cell("NKL-2026-00001", "Ni");
    await user.type(ni, "120");
    expect(ni.getAttribute("aria-invalid")).toBe("true");

    await user.click(screen.getByRole("button", { name: /Save 1 row/ }));
    expect(saves).toHaveLength(0);
    expect(document.activeElement).toBe(ni);
  });

  it("moves down with Enter, up with Shift+Enter, and undoes a cell with Esc", async () => {
    const user = userEvent.setup({ delay: null });
    show();

    const first = cell("NKL-2026-00001", "Fe");
    await user.click(first);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(cell("NKL-2026-00002", "Fe"));
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(document.activeElement).toBe(first);

    await user.type(first, "5");
    await user.keyboard("{Escape}");
    expect(first.value).toBe("");
  });
});

describe("going back to the list", () => {
  it("goes straight back when there is nothing to lose", async () => {
    const user = userEvent.setup({ delay: null });
    const onDone = show();
    await user.click(screen.getByRole("button", { name: en.assay.selection.back }));
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it("asks first when there are unsaved edits", async () => {
    const user = userEvent.setup({ delay: null });
    const onDone = show();
    await user.type(cell("NKL-2026-00001", "Ni"), "1.5");
    await user.click(screen.getByRole("button", { name: en.assay.selection.back }));

    const dialog = await screen.findByRole("dialog");
    expect(onDone).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: en.assay.unsaved.discard }));
    expect(onDone).toHaveBeenCalledWith(false);
    expect(saves).toHaveLength(0);
  });

  it("can save first, and says the list has changed", async () => {
    const user = userEvent.setup({ delay: null });
    const onDone = show();
    await user.type(cell("NKL-2026-00001", "Ni"), "1.5");
    await user.click(screen.getByRole("button", { name: en.assay.selection.back }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: en.assay.unsaved.save }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
    expect(saves).toHaveLength(1);
  });
});

describe("replacing a result that is already there", () => {
  const HELD = [record(1, { ni: 1.2, sampleIdent: "MOL/LIM/S2/PA4/B489/1.1/25" })];

  it("asks before saving, and sends the replacement only once told to", async () => {
    const user = userEvent.setup({ delay: null });
    show(vi.fn(), HELD);

    await user.clear(cell("NKL-2026-00001", "Ni"));
    await user.type(cell("NKL-2026-00001", "Ni"), "1.35");
    await user.keyboard("{Control>}s{/Control}");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/1.2 → 1.35/)).toBeTruthy();
    expect(saves).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: en.assay.overwrite.confirm }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ records: [{ id: "r1", ni: 1.35 }], overwrite: true });
  });

  it("can put the earlier value back instead", async () => {
    const user = userEvent.setup({ delay: null });
    show(vi.fn(), HELD);

    await user.clear(cell("NKL-2026-00001", "Ni"));
    await user.type(cell("NKL-2026-00001", "Ni"), "1.35");
    await user.keyboard("{Control>}s{/Control}");
    await user.click(await screen.findByRole("button", { name: en.assay.overwrite.keepOld }));

    expect(cell("NKL-2026-00001", "Ni").value).toBe("1.2");
    expect(saves).toHaveLength(0);
  });

  it("saves a first result without asking", async () => {
    const user = userEvent.setup({ delay: null });
    show(vi.fn(), HELD);

    await user.type(cell("NKL-2026-00001", "Fe"), "20");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ overwrite: false });
  });
});
