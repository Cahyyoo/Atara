// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { DrillHoleSheetDialog } from "@/modules/eksplorasi/components/sheet/drill-hole-sheet-dialog";
import type { DrillHoleDTO, DrillSheetVerdict } from "@/modules/eksplorasi/types";

vi.mock("@/core/components/ui/toast", () => ({ toast: vi.fn() }));

/**
 * The drilling sheet: the latest holes on top, read-only until unlocked, new
 * holes typed or pasted below, every active row checked, and Save sending the
 * new rows and the unlocked ones together.
 */

const HOLE: DrillHoleDTO = {
  id: "h1",
  holeId: "DH-001",
  area: "Blok A",
  easting: 1000.5,
  northing: null,
  elevation: null,
  azimuth: null,
  dip: null,
  totalDepth: 120,
  status: "ONGOING",
  startDate: "2026-10-01",
  endDate: null,
  remarks: null,
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

type Sent = { dryRun: boolean; rows: { line: number; id?: string; cells: Record<string, string> }[] };
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/drill-holes?")) {
        const data = { drillHoles: [HOLE], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } };
        return { ok: true, json: async () => ({ success: true, data }) };
      }
      const body = JSON.parse(String(init?.body)) as Sent;
      sent.push(body);
      const rows: DrillSheetVerdict[] = body.rows.map((row) => ({ line: row.line, status: row.id ? "update" : "create" }));
      const count = (status: string) => rows.filter((row) => row.status === status).length;
      const summary = { create: count("create"), update: count("update"), unchanged: 0, invalid: 0 };
      const data = { rows, summary, created: body.dryRun ? 0 : summary.create, updated: body.dryRun ? 0 : summary.update };
      return { ok: true, json: async () => ({ success: true, data }) };
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function show(onSaved = vi.fn(), onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <DrillHoleSheetDialog onSaved={onSaved} onClose={onClose} />
    </NextIntlClientProvider>
  );
  await screen.findByRole("textbox", { name: "Row 1 Hole ID" }, { timeout: 3000 });
  return { onSaved, onClose };
}

const box = (row: number, field: string) => screen.getByRole("textbox", { name: `Row ${row} ${field}` }) as HTMLInputElement;
const LONG = { timeout: 3000 };

describe("the drilling sheet", () => {
  it("shows the latest holes read-only, with the new rows below", async () => {
    await show();
    expect(box(1, "Hole ID").value).toBe("DH-001");
    expect(box(1, "Hole ID").readOnly).toBe(true);
    // With its list of statuses, the status box is a combobox.
    expect((screen.getByRole("combobox", { name: "Row 1 Status" }) as HTMLInputElement).value).toBe(
      en.drilling.status.ONGOING
    );
    expect(box(2, "Hole ID").readOnly).toBe(false);
    expect(box(2, "Hole ID").value).toBe("");
  });

  it("spreads a block pasted with its header across the new rows", async () => {
    await show();
    fireEvent.paste(box(2, "Hole ID"), {
      clipboardData: { getData: () => "Hole ID\tTotal Depth (m)\tArea\nDH-100\t85,5\tBlok B\nDH-101\t90\t" },
    });
    expect([box(2, "Hole ID").value, box(2, en.drilling.fields.totalDepth).value, box(2, en.drilling.fields.area).value]).toEqual([
      "DH-100",
      "85,5",
      "Blok B",
    ]);
    expect(box(3, "Hole ID").value).toBe("DH-101");
    // A paste never reaches the locked hole above.
    expect(box(1, "Hole ID").value).toBe("DH-001");
  });

  it("unlocks a hole to change it, and saves it with the new rows", async () => {
    const { onSaved, onClose } = await show();
    fireEvent.click(screen.getByRole("button", { name: en.drilling.sheet.unlock }));
    expect(box(1, en.drilling.fields.totalDepth).readOnly).toBe(false);
    fireEvent.change(box(1, en.drilling.fields.totalDepth), { target: { value: "150" } });
    fireEvent.change(box(2, "Hole ID"), { target: { value: "DH-200" } });

    const save = await screen.findByRole("button", { name: "Save 2 rows" }, LONG);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), LONG);
    fireEvent.click(save);
    await waitFor(() => expect(onSaved).toHaveBeenCalled(), LONG);

    const saved = sent.at(-1)!;
    expect(saved.dryRun).toBe(false);
    expect(saved.rows).toEqual([
      { line: 1, id: "h1", cells: expect.objectContaining({ holeId: "DH-001", totalDepth: "150" }) },
      { line: 2, cells: { holeId: "DH-200" } },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("puts a hole back as it was when it is locked again", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: en.drilling.sheet.unlock }));
    fireEvent.change(box(1, en.drilling.fields.totalDepth), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: en.drilling.sheet.lock }));
    expect(box(1, en.drilling.fields.totalDepth).value).toBe("120");
    expect(box(1, en.drilling.fields.totalDepth).readOnly).toBe(true);
  });
});
