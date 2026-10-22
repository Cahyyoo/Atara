// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { id as messages } from "@/core/i18n/test-messages";
import { DataSourceImportDialog } from "@/modules/eksplorasi/components/import/data-source-import-dialog";
import type { DataSourceView } from "@/modules/eksplorasi/types";

const PREVIEW = {
  total: 34_002,
  valid: 34_000,
  create: 30_000,
  existing: 4_000,
  invalid: 2,
  errors: [
    { line: 7, sampleId: "S-7", field: "date", message: '"x" is not a date.' },
    { line: 9, sampleId: null, field: "sampleId", message: "Sample ID is required." },
  ],
  errorsTotal: 2,
  ignoredHeaders: ["Geologist"],
};

/** An apply answer: NDJSON lines, streamed. */
function ndjson(lines: object[]) {
  const text = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
  return new Response(text, { status: 200 });
}

let applied: FormData | null = null;
let previewed: FormData | null = null;

beforeEach(() => {
  applied = null;
  previewed = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      if (form.get("apply") === "1") {
        applied = form;
        return ndjson([
          { phase: "write", done: 0, total: 34_000 },
          { phase: "write", done: 17_000, total: 34_000 },
          { phase: "done", created: 30_000, updated: 4_000, skipped: 0, invalid: 2 },
        ]);
      }
      previewed = form;
      return { ok: true, json: async () => ({ success: true, data: PREVIEW }) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(view: DataSourceView = "dataSource", onImported = vi.fn()) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <DataSourceImportDialog view={view} open onClose={vi.fn()} onImported={onImported} />
    </NextIntlClientProvider>
  );
  return onImported;
}

async function chooseFile() {
  const input = document.getElementById("data-source-import-file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["Sample ID\nS-1"], "data.csv")] } });
  await screen.findByText("30.000");
}

describe("DataSourceImportDialog", () => {
  it("previews the file: what is new, what exists, and every bad row", async () => {
    renderDialog();
    await chooseFile();

    expect(screen.getByText("34.002")).toBeTruthy();
    expect(screen.getByText("4.000")).toBeTruthy();
    expect(screen.getByText("Sudah ada (dilewati)")).toBeTruthy();
    expect(screen.getByText(/2 baris error/)).toBeTruthy();
    expect(screen.getByText('"x" is not a date.')).toBeTruthy();
    expect(screen.getByText(/Geologist/)).toBeTruthy();
    // Existing rows are only counted once updating is asked for.
    expect(screen.getByRole("button", { name: "Import 30.000 baris" })).toBeTruthy();
    expect(previewed?.get("view")).toBe("dataSource");
  });

  it("imports with the update box ticked, and ends on the totals", async () => {
    const onImported = renderDialog();
    await chooseFile();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Import 34.000 baris" }));

    expect(await screen.findByText("Import selesai")).toBeTruthy();
    expect(applied?.get("updateExisting")).toBe("1");
    expect(onImported).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Ditambahkan")).toBeTruthy());
  });

  it("imports into the list it was opened from, with that list's columns", async () => {
    renderDialog("duplicate");
    expect(screen.getByRole("heading", { name: "Import Duplicate" })).toBeTruthy();
    expect(screen.getByText(/Control Date, Control, Campaign, No, Hole ID, Sample ID/)).toBeTruthy();
    await chooseFile();
    expect(previewed?.get("view")).toBe("duplicate");
  });
});
