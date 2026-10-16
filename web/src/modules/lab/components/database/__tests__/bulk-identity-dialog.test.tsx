// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";

import { en } from "@/core/i18n/test-messages";
import { BulkIdentityDialog, groupBySampleIdent, summarizeCurrent } from "@/modules/lab/components/database/bulk-identity-dialog";
import type { LabRecordListItemDTO } from "@/modules/lab/types";

const OPTIONS = [
  { id: "p1", kind: "PLACE", code: "MOL", label: null, sortOrder: 0, isActive: true },
  { id: "t1", kind: "PIT", code: "A4", label: null, sortOrder: 0, isActive: true },
  { id: "t2", kind: "PIT", code: "A11", label: null, sortOrder: 1, isActive: true },
  { id: "s1", kind: "SIR", code: "3", label: null, sortOrder: 0, isActive: true },
];

function record(id: string, values: Partial<LabRecordListItemDTO>): LabRecordListItemDTO {
  return {
    id,
    labCode: `L-${id}`,
    placeId: null,
    rockTypeId: null,
    nonProdId: null,
    pitId: null,
    sirId: null,
    bargingNo: null,
    sequenceNo: null,
    sampleNo: null,
    sackCount: null,
    sampleIdent: null,
    sample: { id: `s-${id}`, sampleCode: `NKL-${id}`, status: "PENDING", currentStage: null },
    ...values,
  } as LabRecordListItemDTO;
}

/** Two records with a Sample ID each: two forms. */
const IDENTIFIED = [
  record("1", { placeId: "p1", pitId: "t1", sirId: "s1", bargingNo: "B7", sampleIdent: "MOL/S3/PA4/B7" }),
  record("2", { placeId: "p1", pitId: null, sirId: "s1", bargingNo: "B7", sampleIdent: "MOL/S3/B7" }),
];
/** Fresh barcodes, no Sample ID yet: one form. */
const FRESH = [
  record("a", { placeId: "p1", bargingNo: "B7", sampleNo: 1 }),
  record("b", { placeId: "p1", bargingNo: "B7", sampleNo: 2 }),
  record("c", { placeId: "p1", bargingNo: "B7" }),
];

let sent: Record<string, unknown>[] = [];
/** What the next previews report as used twice. */
let clashes: string[] = [];

beforeEach(() => {
  sent = [];
  clashes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/master-options")) {
        return { ok: true, json: async () => ({ success: true, data: { options: OPTIONS } }) };
      }
      const body = JSON.parse(String(init?.body));
      sent.push(body);
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: body.dryRun
            ? {
                preview: [{ sampleCode: "NKL-1", labCode: "L-1", from: "MOL/S3/PA4", to: "MOL/PA4" }],
                more: 0,
                clashes,
                changed: 2,
              }
            : { updated: 2 },
        }),
      };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(records: LabRecordListItemDTO[], onSaved = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <BulkIdentityDialog open records={records} onClose={() => {}} onSaved={onSaved} />
    </NextIntlClientProvider>
  );
  return onSaved;
}

const text = en.database.bulkIdentity;
const lastPreviewRequest = () => [...sent].reverse().find((body) => body.dryRun);
const form = (name: string) => within(screen.getByRole("region", { name }));
type Scope = ReturnType<typeof form> | typeof screen;
const field = (scope: Scope, label: string) => scope.getByLabelText(label) as HTMLInputElement;
const picker = (scope: Scope, label: string) => scope.getByRole("combobox", { name: label });
const list = () => within(screen.getByRole("list", { name: text.listLabel }));
/** The Sample ID's button in the list on the left. */
const entry = (ident: string) =>
  list().getByRole("button", { name: new RegExp(`^${ident.replace(/[/.]/g, "\\$&")}`) });
const status = () => screen.getByRole("status");

async function choose(user: ReturnType<typeof userEvent.setup>, scope: Scope, label: string, option: string) {
  await user.click(picker(scope, label));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("summarizeCurrent", () => {
  it("says empty, one value, or mixed", () => {
    expect(summarizeCurrent([null, ""], String)).toEqual({ kind: "empty" });
    expect(summarizeCurrent(["A4", "A4"], String)).toEqual({ kind: "one", value: "A4" });
    expect(summarizeCurrent(["A4", null, "A11"], String)).toEqual({
      kind: "mixed",
      values: ["A4", "A11"],
      hasEmpty: true,
    });
  });
});

describe("groupBySampleIdent", () => {
  it("gives each Sample ID its own group and puts the rest together, in table order", () => {
    const groups = groupBySampleIdent([FRESH[0], IDENTIFIED[0], FRESH[1], IDENTIFIED[1]]);
    expect(groups.map((group) => [group.ident, group.records.map((row) => row.id)])).toEqual([
      [null, ["a", "b"]],
      ["MOL/S3/PA4/B7", ["1"]],
      ["MOL/S3/B7", ["2"]],
    ]);
  });
});

describe("BulkIdentityDialog", () => {
  describe("per Sample ID", () => {
    it("lists the Sample IDs and draws only the chosen one's form", async () => {
      const user = userEvent.setup();
      show(IDENTIFIED);

      expect(list().getAllByRole("button").length).toBe(2);
      expect(entry("MOL/S3/PA4/B7").getAttribute("aria-current")).toBe("true");
      // One form drawn, however many Sample IDs there are.
      expect(screen.getAllByRole("combobox").length).toBe(5);
      const first = form("MOL/S3/PA4/B7");
      await waitFor(() => expect(picker(first, "Pit Location").textContent).toContain("A4"));
      expect(field(first, "Barging Run").value).toBe("B7");
      expect(first.getByText("NKL-1")).toBeTruthy();
      expect(screen.getByText("1 / 2")).toBeTruthy();

      await user.click(entry("MOL/S3/B7"));
      const second = form("MOL/S3/B7");
      expect(picker(second, "Pit Location").textContent).toContain(text.emptyOption);
      expect(screen.queryByText(text.mixedOption)).toBeNull();
      // One record each: nothing to number in order.
      expect(screen.queryByRole("checkbox", { name: text.numberSequentially })).toBeNull();

      await user.click(screen.getByRole("button", { name: text.previous }));
      expect(screen.getByRole("region", { name: "MOL/S3/PA4/B7" })).toBeTruthy();
      expect((screen.getByRole("button", { name: text.previous }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("says there is nothing to save while every field is left as it is", () => {
      show(IDENTIFIED);
      expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(status().textContent).toBe(text.statusNone);
    });

    it("sends only the form that changed, marks it in the list, and saves it", async () => {
      const user = userEvent.setup();
      const onSaved = show(IDENTIFIED);
      await user.click(screen.getByRole("button", { name: text.next }));
      const second = form("MOL/S3/B7");
      await waitFor(() => expect(picker(second, "Place").textContent).toContain("MOL"));

      await choose(user, second, "Pit Location", "A11");
      await choose(user, second, "Sir (Field Stockpile)", text.emptyOption);
      expect(second.getByText(text.changed)).toBeTruthy();
      expect(second.getByText(text.cleared)).toBeTruthy();
      expect(within(entry("MOL/S3/B7")).getByText("2 changed")).toBeTruthy();
      expect(within(entry("MOL/S3/PA4/B7")).queryByText(/changed/)).toBeNull();

      await waitFor(() =>
        expect(lastPreviewRequest()).toEqual({
          dryRun: true,
          groups: [{ ids: ["2"], set: { pitId: "t2" }, clear: ["sirId"], sampleNoStart: null }],
        })
      );
      await waitFor(() => expect(status().textContent).toBe("2 records will change"));

      // The Sample IDs it would produce, a click away: folded shut until then.
      const toggle = screen.getByRole("button", { name: text.showPreview });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.getByText("MOL/PA4").closest("[inert]")).toBeTruthy();
      await user.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("MOL/PA4").closest("[inert]")).toBeNull();
      expect(screen.getByText("2 records will change, 0 unchanged.")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "Save 2 records" }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(sent.at(-1)).toEqual({
        groups: [{ ids: ["2"], set: { pitId: "t2" }, clear: ["sirId"], sampleNoStart: null }],
      });
    });

    it("keeps each form's edits while moving between them, and sends them together", async () => {
      const user = userEvent.setup();
      show(IDENTIFIED);
      await user.type(field(form("MOL/S3/PA4/B7"), "Sacks"), "4");
      await user.click(screen.getByRole("button", { name: text.next }));
      await user.type(field(form("MOL/S3/B7"), "Sacks"), "6");
      await user.click(entry("MOL/S3/PA4/B7"));
      expect(field(form("MOL/S3/PA4/B7"), "Sacks").value).toBe("4");

      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([
          { ids: ["1"], set: { sackCount: 4 }, clear: [], sampleNoStart: null },
          { ids: ["2"], set: { sackCount: 6 }, clear: [], sampleNoStart: null },
        ])
      );
    });

    it("shows a clash without being asked", async () => {
      clashes = ["MOL/PA4"];
      const user = userEvent.setup();
      show(IDENTIFIED);
      await user.type(field(form("MOL/S3/PA4/B7"), "Sacks"), "4");

      await waitFor(() => expect(status().textContent).toBe("1 Sample ID would be used twice"));
      expect(screen.getByText(/These Sample IDs would be used twice: MOL\/PA4/)).toBeTruthy();
      expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("puts the records without a Sample ID in one form, numbered in order", async () => {
      const user = userEvent.setup();
      show([IDENTIFIED[0], FRESH[0], FRESH[1]]);
      expect(form("MOL/S3/PA4/B7").queryByRole("checkbox")).toBeNull();

      await user.click(entry(text.groupNoIdent));
      const fresh = form(text.groupNoIdent);
      expect(fresh.getByText("2 records")).toBeTruthy();
      // Sample numbers 1 and 2: mixed, left alone unless something is typed.
      expect(field(fresh, "Quality No.").placeholder).toBe(text.mixedPlaceholder);

      await user.type(field(fresh, "Quality No."), "5");
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([{ ids: ["a", "b"], set: {}, clear: [], sampleNoStart: 5 }])
      );

      // Off: the same number for both.
      await user.click(fresh.getByRole("checkbox", { name: text.numberSequentially }));
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([
          { ids: ["a", "b"], set: { sampleNo: 5 }, clear: [], sampleNoStart: null },
        ])
      );
    });

    it("scrolls inside the dialog, keeps Save in view, and draws no blur behind", () => {
      show(IDENTIFIED);
      const body = document.querySelector('[data-slot="bulk-identity-body"]')!;
      expect(body.className).toContain("overflow-y-auto");
      expect(body.contains(picker(form("MOL/S3/PA4/B7"), "Place"))).toBe(true);
      expect(body.contains(screen.getByRole("button", { name: /Save/ }))).toBe(false);

      const overlay = document.querySelector('[data-slot="dialog-overlay"]');
      expect(overlay?.className).toContain("backdrop-blur-none");
    });
  });

  describe("without jumps", () => {
    it("keeps the last answer on screen, dimmed, while the next is checked", async () => {
      const user = userEvent.setup();
      show(FRESH);
      await user.type(field(screen, "Sacks"), "4");
      await waitFor(() => expect(status().textContent).toBe("2 records will change"));
      expect(status().getAttribute("aria-busy")).toBe("false");

      await user.type(field(screen, "Sacks"), "5");
      // Not "Checking…": the earlier answer stays until the new one is in.
      expect(status().getAttribute("aria-busy")).toBe("true");
      expect(status().textContent).toBe("2 records will change");
      expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);

      await waitFor(() => expect(status().getAttribute("aria-busy")).toBe("false"));
      expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("marks a changed field on its label line, so nothing below it moves", async () => {
      const user = userEvent.setup();
      show(FRESH);
      await user.type(field(screen, "Sacks"), "4");
      const label = screen.getByText("Sacks", { selector: "label" });
      const badge = screen.getByText(text.changed);
      expect(label.parentElement?.contains(badge)).toBe(true);
      expect(label.parentElement?.contains(screen.getByRole("button", { name: text.revert }))).toBe(true);
    });
  });

  describe("one form", () => {
    it("shows a single form, without a list, when no record has a Sample ID", async () => {
      show(FRESH);
      expect(screen.queryByRole("list", { name: text.listLabel })).toBeNull();
      expect(screen.queryByRole("button", { name: /One form for all/ })).toBeNull();
      await waitFor(() => expect(picker(screen, "Place").textContent).toContain("MOL"));
      expect(field(screen, "Barging Run").value).toBe("B7");
    });

    it("puts a field back with Undo, and leaves it out of what is sent", async () => {
      const user = userEvent.setup();
      show(FRESH);
      await user.clear(field(screen, "Barging Run"));
      await user.type(field(screen, "Barging Run"), "B8");
      await user.type(field(screen, "Sacks"), "4");
      expect(screen.getAllByRole("button", { name: text.revert }).length).toBe(2);

      await user.click(screen.getAllByRole("button", { name: text.revert })[0]);
      expect(field(screen, "Barging Run").value).toBe("B7");

      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([
          { ids: ["a", "b", "c"], set: { sackCount: 4 }, clear: [], sampleNoStart: null },
        ])
      );
    });

    it("empties a field the records agree on", async () => {
      const user = userEvent.setup();
      show(FRESH);
      await user.clear(field(screen, "Barging Run"));
      expect(screen.getByText(text.cleared)).toBeTruthy();
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([
          { ids: ["a", "b", "c"], set: {}, clear: ["bargingNo"], sampleNoStart: null },
        ])
      );
    });

    it("refuses a number that is not a whole number", async () => {
      const user = userEvent.setup();
      show(FRESH);
      await user.type(field(screen, "Sacks"), "4x");
      expect(screen.getByText(text.invalidNumber)).toBeTruthy();
      expect(status().textContent).toBe(text.incomplete);
      expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("edits a single record like an ordinary form, with its sample number as it is", async () => {
      const user = userEvent.setup();
      show([record("1", { sampleNo: 3, bargingNo: "B7", sampleIdent: "B7/3" })]);

      expect(screen.queryByRole("list", { name: text.listLabel })).toBeNull();
      expect(field(screen, "Quality No.").value).toBe("3");

      await user.clear(field(screen, "Quality No."));
      await user.type(field(screen, "Quality No."), "7");
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([
          { ids: ["1"], set: { sampleNo: 7 }, clear: [], sampleNoStart: null },
        ])
      );
    });
  });

  describe("minimized", () => {
    /** The dialog as the table holds it: open, and minimized or not. */
    function Minimizable({ onClose }: { onClose: () => void }) {
      const [minimized, setMinimized] = useState(false);
      return (
        <BulkIdentityDialog
          open
          records={FRESH}
          minimized={minimized}
          onMinimizedChange={setMinimized}
          onClose={onClose}
          onSaved={() => {}}
        />
      );
    }

    function showMinimizable() {
      const onClose = vi.fn();
      render(
        <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
          <Minimizable onClose={onClose} />
        </NextIntlClientProvider>
      );
      return onClose;
    }

    it("hides to a small bar and comes back with everything typed", async () => {
      const user = userEvent.setup();
      showMinimizable();
      await user.type(field(screen, "Sacks"), "4");

      await user.click(screen.getByRole("button", { name: text.minimize }));
      // It shrinks toward the bar in the bottom right, where it went.
      expect(document.querySelector('[data-slot="dialog-content"]')?.className).toContain(
        "data-closed:origin-bottom-right"
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      const bar = within(screen.getByRole("region", { name: text.minimizedTitle }));
      expect(bar.getByText("3 records · 1 change")).toBeTruthy();

      await user.click(bar.getByRole("button", { name: text.restore }));
      expect(await screen.findByRole("dialog")).toBeTruthy();
      expect(screen.queryByRole("region", { name: text.minimizedTitle })).toBeNull();
      expect(field(screen, "Sacks").value).toBe("4");
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([
          { ids: ["a", "b", "c"], set: { sackCount: 4 }, clear: [], sampleNoStart: null },
        ])
      );
    });

    it("closes, changes and all, from the bar", async () => {
      const user = userEvent.setup();
      const onClose = showMinimizable();
      await user.click(screen.getByRole("button", { name: text.minimize }));
      await user.click(screen.getByRole("button", { name: text.discard }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("with many Sample IDs", () => {
    /** Eight records, each with its own Sample ID, all from MOL. */
    const MANY = Array.from({ length: 8 }, (_, index) =>
      record(`m${index}`, { placeId: "p1", pitId: "t1", sampleNo: index + 1, sampleIdent: `MOL/PA4/${index + 1}` })
    );
    const ids = MANY.map((row) => row.id);

    it("starts on one form for all of them", async () => {
      const user = userEvent.setup();
      show(MANY);
      expect(screen.getByRole("button", { name: "One form for all (8)", pressed: true })).toBeTruthy();
      expect(screen.queryByRole("list", { name: text.listLabel })).toBeNull();
      await waitFor(() => expect(picker(screen, "Pit Location").textContent).toContain("A4"));

      await choose(user, screen, "Pit Location", "A11");
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([{ ids, set: { pitId: "t2" }, clear: [], sampleNoStart: null }])
      );
    });

    it("keeps each way's changes apart, sends only the one shown, and says so", async () => {
      const user = userEvent.setup();
      show(MANY);
      await user.type(field(screen, "Sacks"), "4");
      await user.click(screen.getByRole("button", { name: "Per Sample ID (8)" }));
      expect(screen.getByText(text.otherModeChanges)).toBeTruthy();

      await user.click(entry("MOL/PA4/5"));
      await user.type(field(form("MOL/PA4/5"), "Sacks"), "9");
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([
          { ids: ["m4"], set: { sackCount: 9 }, clear: [], sampleNoStart: null },
        ])
      );

      await user.click(screen.getByRole("button", { name: "One form for all (8)" }));
      expect(field(screen, "Sacks").value).toBe("4");
      await waitFor(() =>
        expect(lastPreviewRequest()?.groups).toEqual([{ ids, set: { sackCount: 4 }, clear: [], sampleNoStart: null }])
      );
    });

    it("finds a Sample ID or sample code, shows only the changed ones, and follows the filter", async () => {
      const user = userEvent.setup();
      show(MANY);
      await user.click(screen.getByRole("button", { name: "Per Sample ID (8)" }));
      expect(list().getAllByRole("button").length).toBe(8);

      await user.type(screen.getByLabelText(text.search), "pa4/7");
      expect(list().getAllByRole("button").length).toBe(1);
      // The open form was filtered out: the one listed takes its place.
      expect(screen.getByRole("region", { name: "MOL/PA4/7" })).toBeTruthy();
      await user.clear(screen.getByLabelText(text.search));
      await user.type(screen.getByLabelText(text.search), "NKL-m1");
      expect(entry("MOL/PA4/2")).toBeTruthy();
      expect(list().getAllByRole("button").length).toBe(1);
      await user.clear(screen.getByLabelText(text.search));

      await user.click(screen.getByRole("checkbox", { name: text.onlyChanged }));
      expect(screen.getByText(text.noMatch)).toBeTruthy();
      await user.click(screen.getByRole("checkbox", { name: text.onlyChanged }));

      await user.click(entry("MOL/PA4/6"));
      await user.type(field(form("MOL/PA4/6"), "Sacks"), "2");
      await user.click(screen.getByRole("checkbox", { name: text.onlyChanged }));
      expect(list().getAllByRole("button").length).toBe(1);
      expect(within(entry("MOL/PA4/6")).getByText("1 changed")).toBeTruthy();
    });
  });
});
