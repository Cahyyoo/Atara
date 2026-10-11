// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../../messages/id.json";
import { DrillHoleImportDialog } from "@/components/drilling/drill-hole-import-dialog";

const PREVIEW = {
  total: 34_002,
  valid: 34_000,
  create: 30_000,
  existing: 4_000,
  invalid: 2,
  errors: [
    { line: 7, holeId: "DH-7", field: "dip", message: '"x" is not a number.' },
    { line: 9, holeId: null, field: "holeId", message: "Hole ID is required." },
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

beforeEach(() => {
  applied = null;
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
      return { ok: true, json: async () => ({ success: true, data: PREVIEW }) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(onImported = vi.fn()) {
  render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <DrillHoleImportDialog open onClose={vi.fn()} onImported={onImported} />
    </NextIntlClientProvider>
  );
  return onImported;
}

async function chooseFile() {
  const input = document.getElementById("drill-import-file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["Hole ID\nDH-1"], "holes.csv")] } });
  await screen.findByText("30.000");
}

describe("DrillHoleImportDialog", () => {
  it("previews the file: what is new, what exists, and every bad row", async () => {
    renderDialog();
    await chooseFile();

    expect(screen.getByText("34.002")).toBeTruthy();
    expect(screen.getByText("4.000")).toBeTruthy();
    expect(screen.getByText("Sudah ada (dilewati)")).toBeTruthy();
    expect(screen.getByText(/2 baris error/)).toBeTruthy();
    expect(screen.getByText('"x" is not a number.')).toBeTruthy();
    expect(screen.getByText(/Geologist/)).toBeTruthy();
    // Existing holes are only counted once updating is asked for.
    expect(screen.getByRole("button", { name: "Import 30.000 baris" })).toBeTruthy();
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
});
