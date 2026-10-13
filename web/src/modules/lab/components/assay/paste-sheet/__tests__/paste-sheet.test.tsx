// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { resetPersistedColumns } from "@/core/hooks/use-persisted-columns";
import { PasteSheetDialog } from "@/modules/lab/components/assay/paste-sheet/paste-sheet-dialog";
import { sheetToImportText } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import type { ImportPreviewRow } from "@/modules/lab/types";

/**
 * Pasting results by Sample ID into a sheet: the block spreads across rows and
 * columns, the server's verdict on each row lands on that row, and Save writes
 * them through the sheet import.
 */

let requests: { csv: string; apply: boolean; overwrite: boolean }[] = [];

/** The server, as far as this screen needs it: a verdict per line it was sent. */
function verdicts(csv: string): ImportPreviewRow[] {
  return csv
    .split("\n")
    .slice(1)
    .flatMap((line, index): ImportPreviewRow[] => {
      const [key, ni] = line.split("\t");
      if (!key && !ni) return [];
      const at = index + 2;
      if (key === "NOPE") return [{ line: at, labCode: key, status: "unknown", changes: {}, field: "sampleIdent", message: "No sample" }];
      if (!/^\d+(\.\d+)?$/.test(ni ?? "")) {
        return [{ line: at, labCode: key, status: "invalid", changes: {}, field: "ni", message: `ni: "${ni}" is not a number.` }];
      }
      return [{ line: at, labCode: key, sampleCode: `S-${key}`, status: "update", changes: { ni: { from: null, to: Number(ni) } } }];
    });
}

beforeEach(() => {
  requests = [];
  window.localStorage.clear();
  resetPersistedColumns();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const rows = verdicts(body.csv);
      const count = (status: string) => rows.filter((row) => row.status === status).length;
      const summary = {
        total: rows.length,
        update: count("update"),
        create: 0,
        unchanged: 0,
        unknown: count("unknown"),
        invalid: count("invalid"),
        overwrite: 0,
      };
      return { ok: true, json: async () => ({ success: true, data: { rows, summary, applied: body.apply } }) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(onApplied = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <PasteSheetDialog open onClose={vi.fn()} onApplied={onApplied} />
    </NextIntlClientProvider>
  );
  return onApplied;
}

const box = (row: number, column: string) =>
  screen.getByRole("textbox", { name: `Row ${row} ${column}` }) as HTMLInputElement;

describe("the paste sheet", () => {
  it("is sent to the import as a header and a line per row", () => {
    const text = sheetToImportText([{ sampleIdent: "A-1", ni: "1.5" }, {}, { sampleIdent: "A-3", measurementFinished: "2026-03-16T10:34" }], [
      "sampleIdent",
      "ni",
      "measurementFinished",
    ]);
    // The blank row stays, so the import's line numbers come back as row + 2.
    expect(text).toBe("Sample ID\tni\tMeasurement Finished\nA-1\t1.5\t\n\nA-3\t\t2026-03-16 10:34");
  });

  it("spreads a pasted block across the sheet and paints the verdict on each row", async () => {
    show();
    fireEvent.paste(box(1, "Sample ID"), {
      clipboardData: { getData: () => "Sample ID\tNi\nA-1\t1.5\nA-2\tx\nNOPE\t1" },
    });

    expect(box(1, "Sample ID").value).toBe("A-1");
    expect(box(2, "Ni %").value).toBe("x");
    expect(box(3, "Sample ID").value).toBe("NOPE");

    await waitFor(() => expect(requests).toHaveLength(1), { timeout: 8000 });
    expect(requests[0]).toMatchObject({ apply: false, overwrite: false });
    expect(requests[0].csv.startsWith("Sample ID\tni\tfe")).toBe(true);

    await waitFor(() => expect(box(2, "Ni %").getAttribute("aria-invalid")).toBe("true"), { timeout: 8000 });
    expect(box(2, "Ni %").title).toContain("is not a number");
    expect(box(3, "Sample ID").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("img", { name: /Will update/ })).toBeTruthy();
    // Nothing is saved while a row is wrong.
    expect((screen.getByRole("button", { name: "Save 1 row(s)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves through the import once every row is right", async () => {
    const onApplied = show();
    fireEvent.paste(box(1, "Sample ID"), { clipboardData: { getData: () => "Sample ID\tNi\nA-1\t1.5\nA-2\tx" } });
    await waitFor(() => expect(box(2, "Ni %").getAttribute("aria-invalid")).toBe("true"), { timeout: 8000 });

    fireEvent.change(box(2, "Ni %"), { target: { value: "1.6" } });
    const save = await screen.findByRole("button", { name: "Save 2 row(s)" }, { timeout: 8000 });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), { timeout: 8000 });

    await userEvent.setup().click(save);
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(2), { timeout: 8000 });
    expect(requests.at(-1)).toMatchObject({ apply: true, overwrite: false });
  });

  it("copies selected boxes out as rows and columns for Excel", () => {
    show();
    fireEvent.paste(box(1, "Sample ID"), { clipboardData: { getData: () => "A-1\t1.5\nA-2\t1.6" } });

    fireEvent.mouseDown(box(1, "Sample ID"), { button: 0 });
    fireEvent.mouseOver(box(2, "Ni %"));
    fireEvent.mouseUp(window);
    const setData = vi.fn();
    fireEvent.copy(box(1, "Sample ID"), { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "A-1\t1.5\nA-2\t1.6");
  });
});
