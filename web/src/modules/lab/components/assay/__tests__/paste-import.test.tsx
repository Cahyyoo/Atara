// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { PasteImport } from "@/modules/lab/components/assay/paste-import";
import type { ImportPreviewDTO } from "@/modules/lab/types";

const SHEET = "Lab Code\tNi\nSPR.001\t1,86\nSPR.404\t1\nSPR.002\t1,12\n";

function previewOf(overrides: Partial<ImportPreviewDTO["summary"]> = {}, applied = false): ImportPreviewDTO {
  return {
    applied,
    summary: { total: 3, update: 2, create: 0, unchanged: 0, unknown: 1, invalid: 0, overwrite: 0, duplicate: 0, ...overrides },
    rows: [
      { line: 2, labCode: "SPR.001", sampleCode: "NKL-2026-00001", status: "update", changes: { ni: { from: null, to: 1.86 } } },
      { line: 3, labCode: "SPR.404", status: "unknown", changes: {}, message: "No sample with this lab code." },
      { line: 4, labCode: "SPR.002", sampleCode: "NKL-2026-00002", status: "update", changes: { ni: { from: null, to: 1.12 } } },
    ],
  };
}

let calls: { csv: string; apply: boolean }[] = [];
let respond: (apply: boolean) => unknown = (apply) => ({ success: true, data: previewOf({}, apply) });

beforeEach(() => {
  calls = [];
  respond = (apply) => ({ success: true, data: previewOf({}, apply) });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return { ok: true, json: async () => respond(body.apply) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <PasteImport />
    </NextIntlClientProvider>
  );
}

const box = () => screen.getByLabelText(en.assay.paste.boxLabel) as HTMLTextAreaElement;

function paste(text: string) {
  fireEvent.change(box(), { target: { value: text } });
}

describe("pasting results from Excel", () => {
  it("checks the pasted block against the server, without saving", async () => {
    show();
    paste(SHEET);

    await screen.findByText("2 to update");
    expect(calls).toEqual([
      { csv: SHEET, apply: false, overwrite: false, duplicates: false, reason: en.assay.paste.auditReason },
    ]);
    expect(screen.getByText("1 not found")).toBeTruthy();
  });

  it("lists the rows that need attention first", async () => {
    show();
    paste(SHEET);
    await screen.findByText("2 to update");

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("SPR.404");
    expect(rows[0].textContent).toContain(en.assay.paste.status.unknown);
    // Matched rows name the sample by its barcode code.
    expect(rows[1].textContent).toContain("NKL-2026-00001");
  });

  it("saves the matched rows and skips what was not found", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    paste(SHEET);
    await screen.findByText("2 to update");

    expect(screen.getByText(/1 not found will be skipped/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save 2 row(s)" }));

    await waitFor(() => expect(calls.some((call) => call.apply)).toBe(true));
    expect(calls.find((call) => call.apply)?.csv).toBe(SHEET);
    expect(await screen.findByText("2 sample(s) updated")).toBeTruthy();
  });

  it("shows look-alike results plainly, and lists them before saving", async () => {
    respond = (apply) => {
      const preview = previewOf({ duplicate: 2 }, apply);
      preview.rows[0] = { ...preview.rows[0], duplicateLines: [4] };
      preview.rows[2] = { ...preview.rows[2], duplicateLines: [2], duplicateOf: ["MOL B7/1.2"] };
      return { success: true, data: preview };
    };
    const user = userEvent.setup({ delay: null });
    show();
    paste(SHEET);

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("2 rows have results identical to another");
    expect(banner.textContent).toContain("Row 2 · SPR.001");
    expect(banner.textContent).toContain("same results as stored sample MOL B7/1.2");
    expect(screen.getAllByText(en.assay.paste.duplicateBadge).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Save 2 row(s)" }));
    const dialog = await screen.findByRole("dialog", { name: en.assay.paste.duplicateDialogTitle });
    expect(calls.some((call) => call.apply)).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: en.assay.paste.saveAnyway }));
    await waitFor(() => expect(calls.find((call) => call.apply)).toMatchObject({ duplicates: true }));
  });

  it("will not save while a row is not valid", async () => {
    respond = () => ({ success: true, data: previewOf({ invalid: 1 }) });
    show();
    paste(SHEET);
    await screen.findByText("1 not valid");

    expect(screen.getByRole("button", { name: "Save 2 row(s)" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Fix them in Excel/)).toBeTruthy();
  });

  it("explains a block copied without its header row", async () => {
    respond = () => ({ success: false, error: "The sheet needs a column", code: "import-noKey" });
    show();
    paste("SPR.001\t1,86\n");
    expect(await screen.findByText(en.assay.paste.errors.noKey)).toBeTruthy();
  });

  it("takes Ctrl+V from anywhere on the page into the box", async () => {
    show();
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
      clipboardData: { getData: () => string };
    };
    event.clipboardData = { getData: () => SHEET };
    await act(async () => {
      document.body.dispatchEvent(event);
    });

    expect(box().value).toBe(SHEET);
    await screen.findByText("2 to update");
  });

  it("can show only the rows with problems", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    paste(SHEET);
    await screen.findByText("2 to update");

    await user.click(screen.getByRole("checkbox", { name: en.assay.paste.problemsOnly }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });
});
