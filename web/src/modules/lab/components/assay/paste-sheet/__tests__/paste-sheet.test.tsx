// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { resetPersistedColumns } from "@/core/hooks/use-persisted-columns";
import { PasteSheetDialog } from "@/modules/lab/components/assay/paste-sheet/paste-sheet-dialog";
import { sheetToImportText } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { SheetSkeleton } from "@/modules/lab/components/assay/paste-sheet/sheet-busy";
import type { ImportPreviewRow } from "@/modules/lab/types";

/**
 * Pasting results by Sample ID into a sheet headed as the instrument's export
 * is: the block spreads across rows and columns, only the rows that changed
 * are checked, each verdict lands on its row, and Save writes the whole sheet.
 */

let requests: { csv: string; apply: boolean; overwrite: boolean }[] = [];
/** Held open by a test that wants to see what the sheet shows while it waits. */
let gate: Promise<void> | null = null;

/** The server, as far as this screen needs it: a verdict per line it was sent, read by its header. */
function verdicts(csv: string): ImportPreviewRow[] {
  const [header, ...lines] = csv.split("\n");
  const at = (name: string) => header.split("\t").indexOf(name);
  return lines.flatMap((line, index): ImportPreviewRow[] => {
    const cells = line.split("\t");
    const key = cells[at("Sample ID")];
    const ni = cells[at("Ni (%)")];
    if (!key && !ni) return [];
    const row = index + 2;
    if (key === "NOPE") return [{ line: row, labCode: key, status: "unknown", changes: {}, field: "sampleIdent", message: "No sample" }];
    if (!/^\d+(\.\d+)?$/.test(ni ?? "")) {
      return [{ line: row, labCode: key, status: "invalid", changes: {}, field: "ni", message: `ni: "${ni}" is not a number.` }];
    }
    return [{ line: row, labCode: key, sampleCode: `S-${key}`, status: "update", changes: { ni: { from: null, to: Number(ni) } } }];
  });
}

/** Data lines in a request: what the sheet actually sent to be checked. */
const dataLines = (csv: string) => csv.split("\n").slice(1).filter((line) => line.replace(/\t/g, "").trim() !== "");

beforeEach(() => {
  requests = [];
  gate = null;
  window.localStorage.clear();
  resetPersistedColumns();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (gate) await gate;
      const rows = verdicts(body.csv);
      const count = (status: string) => rows.filter((row) => row.status === status).length;
      const summary = { total: rows.length, update: count("update"), create: 0, unchanged: 0, unknown: count("unknown"), invalid: count("invalid"), overwrite: 0, duplicate: 0 };
      return { ok: true, json: async () => ({ success: true, data: { rows, summary, applied: body.apply } }) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function render_(onApplied = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <PasteSheetDialog open onClose={vi.fn()} onApplied={onApplied} />
    </NextIntlClientProvider>
  );
  return onApplied;
}

/** Opens the sheet and waits for its grid, which follows the opening animation. */
async function show(onApplied = vi.fn()) {
  render_(onApplied);
  await screen.findByRole("textbox", { name: "Row 1 Sample ID" }, { timeout: 3000 });
  return onApplied;
}

const box = (row: number, column: string) =>
  screen.getByRole("textbox", { name: `Row ${row} ${column}` }) as HTMLInputElement;
const paste = (text: string) => fireEvent.paste(box(1, "Sample ID"), { clipboardData: { getData: () => text } });
const LONG = { timeout: 8000 };

describe("the paste sheet", () => {
  it("takes results by pasting only: the Sample ID is the one box that is typed", async () => {
    await show();
    expect(box(1, "Sample ID").readOnly).toBe(false);
    expect(box(1, "Ni (%)").readOnly).toBe(true);
    expect(box(1, "Measurement Method").readOnly).toBe(true);

    paste("Sample ID\tNi (%)\nA-1\t1.5");
    expect(box(1, "Ni (%)").value).toBe("1.5");
    await userEvent.setup().type(box(1, "Ni (%)"), "9");
    expect(box(1, "Ni (%)").value).toBe("1.5");
    fireEvent.change(box(1, "Sample ID"), { target: { value: "A-9" } });
    expect(box(1, "Sample ID").value).toBe("A-9");
  });

  it("warns about rows with the same results, plainly, and asks with the list before saving them", async () => {
    const onApplied = await show();
    paste("Sample ID\tNi (%)\nA-1\t1.5\nA-2\t1.5\nA-3\t1.7");
    await waitFor(() => expect(screen.getByRole("img", { name: "Same results as row 2" })).toBeTruthy(), LONG);
    expect(screen.getByRole("img", { name: "Same results as row 1" }).textContent).toBe(en.assay.paste.duplicateBadge);

    // A banner over the sheet, naming the rows; the rows themselves amber.
    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("2 rows have results identical to another");
    expect(banner.textContent).toContain("Row 1 · A-1");
    expect(banner.textContent).toContain("Row 2 · A-2");
    expect(box(1, "Sample ID").closest("tr")?.hasAttribute("data-duplicate")).toBe(true);
    expect(box(3, "Sample ID").closest("tr")?.hasAttribute("data-duplicate")).toBe(false);

    const user = userEvent.setup();
    await user.click(within(banner).getByRole("button", { name: /Row 2/ }));
    await waitFor(() => expect(document.activeElement).toBe(box(2, "Sample ID")));

    const save = await screen.findByRole("button", { name: "Save 3 row(s)" }, LONG);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), LONG);
    await user.click(save);
    const dialog = await screen.findByRole("dialog", { name: en.assay.paste.duplicateDialogTitle });
    expect(dialog.textContent).toContain("Row 1 · A-1");
    expect(requests.some((request) => request.apply)).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: en.assay.paste.saveAnyway }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(3), LONG);
    expect(requests.at(-1)).toMatchObject({ apply: true, duplicates: true });
  });

  it("takes a trace element to ten decimals, and marks only an eleventh", async () => {
    await show();
    paste("Sample ID\tZn (%)\nA-1\t0.0303\nA-2\t0.12345678901");
    expect(box(1, "Zn (%)").getAttribute("aria-invalid")).toBeNull();
    expect(box(2, "Zn (%)").getAttribute("aria-invalid")).toBe("true");
  });

  it("has an outline to show while it opens: the real headings, and not one input", () => {
    // jsdom runs no animation, so the dialog is ready at once there; the
    // outline itself is what the opening frames draw in a browser.
    const { container } = render(<SheetSkeleton columns={["Sample ID", "Measurement Finished", "Ni (%)"]} />);
    expect(container.textContent).toContain("Measurement Finished");
    expect(container.querySelector("input")).toBeNull();
  });

  it("is headed exactly as the instrument's export, with the Sample ID in front", async () => {
    await show();
    const headings = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headings.slice(1, 6)).toEqual(["Sample ID", "Measurement Finished", "Ni (%)", "Fe (%)", "Co (%)"]);
    expect(headings).toContain("SiO2 (%)");
    expect(headings.slice(-3)).toEqual(["Sum (%)", "Measurement Method", "Solution ID"]);
  });

  it("is sent to the import with those same headings, a line per row", () => {
    const text = sheetToImportText([{ sampleIdent: "A-1", ni: "1.5" }, {}, { sampleIdent: "A-3", measurementFinished: "9/1/2026 8:54" }], [
      "sampleIdent",
      "measurementFinished",
      "ni",
    ]);
    // The blank row stays, so the import's line numbers come back as row + 2;
    // the date goes as it was written.
    expect(text).toBe("Sample ID\tMeasurement Finished\tNi (%)\nA-1\t\t1.5\n\nA-3\t9/1/2026 8:54\t");
  });

  it("spreads a pasted block and paints the verdict on each row", async () => {
    await show();
    paste("Sample ID\tNi (%)\nA-1\t1.5\nA-2\tx\nNOPE\t1");
    expect(box(1, "Sample ID").value).toBe("A-1");
    expect(box(3, "Sample ID").value).toBe("NOPE");

    await waitFor(() => expect(requests).toHaveLength(1), LONG);
    expect(requests[0].csv.startsWith("Sample ID\tMeasurement Finished\tNi (%)\tFe (%)")).toBe(true);

    await waitFor(() => expect(screen.getByRole("img", { name: /Will update/ })).toBeTruthy(), LONG);
    // "x" is wrong before the server says so, and stays wrong after.
    expect(box(2, "Ni (%)").getAttribute("aria-invalid")).toBe("true");
    expect(box(3, "Sample ID").getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "Save 1 row(s)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("checks only the row that changed, then saves the whole sheet", async () => {
    const onApplied = await show();
    paste("Sample ID\tNi (%)\nA-1\t1.5\nA-2\tx\nA-3\t1.7");
    await waitFor(() => expect(screen.getByRole("img", { name: /Not valid/ })).toBeTruthy(), LONG);
    const before = requests.length;

    // A result is put right by pasting over it: the box takes no typing.
    fireEvent.paste(box(2, "Ni (%)"), { clipboardData: { getData: () => "1.6" } });
    const save = await screen.findByRole("button", { name: "Save 3 row(s)" }, LONG);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), LONG);
    // One more check, carrying the one row that changed and nothing else.
    expect(requests).toHaveLength(before + 1);
    expect(dataLines(requests.at(-1)!.csv)).toEqual([expect.stringMatching(/^A-2\t\t1\.6/)]);

    await userEvent.setup().click(save);
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(3), LONG);
    expect(requests.at(-1)).toMatchObject({ apply: true, overwrite: false });
    expect(dataLines(requests.at(-1)!.csv)).toHaveLength(3);
  });

  it("takes the date as the instrument's sheet writes it, and says how it was read", async () => {
    await show();
    fireEvent.change(box(1, "Measurement Finished"), { target: { value: "9/1/2026 8:54" } });
    expect(box(1, "Measurement Finished").value).toBe("9/1/2026 8:54");
    expect(box(1, "Measurement Finished").title).toMatch(/Sep 1, 2026.*8:54.*WITA/);

    // Wrong at once, without waiting for the server.
    fireEvent.change(box(1, "Measurement Finished"), { target: { value: "1/1/2099 8:00" } });
    expect(box(1, "Measurement Finished").getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(box(1, "Measurement Finished"), { target: { value: "yesterday" } });
    expect(box(1, "Measurement Finished").title).toContain("cannot be read");
  });

  it("lays a block from the instrument's export down from the date box, column for column", async () => {
    await show();
    fireEvent.paste(box(1, "Measurement Finished"), { clipboardData: { getData: () => "9/1/2026 8:54\t1.86\t42.2\n9/1/2026 9:10\t1.9\t41" } });
    expect(box(1, "Measurement Finished").value).toBe("9/1/2026 8:54");
    expect(box(1, "Ni (%)").value).toBe("1.86");
    expect(box(2, "Fe (%)").value).toBe("41");
  });

  it("shows how far the check has got while it runs, and says so while it saves", async () => {
    let release = () => {};
    gate = new Promise<void>((resolve) => (release = resolve));
    await show();
    paste("Sample ID\tNi (%)\nA-1\t1.5\nA-2\t1.6");

    await waitFor(() => expect(screen.getByRole("progressbar")).toBeTruthy(), LONG);
    expect(screen.getByText("Checking 0 of 2 rows…")).toBeTruthy();
    release();
    const save = await screen.findByRole("button", { name: "Save 2 row(s)" }, LONG);

    gate = new Promise<void>((resolve) => (release = resolve));
    await userEvent.setup().click(save);
    expect(await screen.findByText("Saving 2 rows… keep this page open.")).toBeTruthy();
    release();
  });

  it("copies selected boxes out as rows and columns for Excel", async () => {
    await show();
    paste("A-1\t9/1/2026 8:54\t1.5\nA-2\t\t1.6");

    fireEvent.mouseDown(box(1, "Sample ID"), { button: 0 });
    fireEvent.mouseOver(box(2, "Ni (%)"));
    fireEvent.mouseUp(window);
    const setData = vi.fn();
    fireEvent.copy(box(1, "Sample ID"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "A-1\t9/1/2026 8:54\t1.5\nA-2\t\t1.6");
  });
});
