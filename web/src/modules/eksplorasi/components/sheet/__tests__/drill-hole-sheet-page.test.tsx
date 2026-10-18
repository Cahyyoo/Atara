// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { DrillHoleSheetPage } from "@/modules/eksplorasi/components/sheet/drill-hole-sheet-page";
import type { DrillHoleDTO, DrillSheetVerdict } from "@/modules/eksplorasi/types";

vi.mock("@/core/components/ui/toast", () => ({ toast: vi.fn() }));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/**
 * The drilling sheet, on its own page: the latest holes on top, read-only until unlocked, new
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
  push.mockReset();
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

async function show(editing?: DrillHoleDTO) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <DrillHoleSheetPage editing={editing} />
    </NextIntlClientProvider>
  );
  await screen.findByRole("textbox", { name: "Row 1 Hole ID" }, { timeout: 3000 });
}

const box = (row: number, field: string) => screen.getByRole("textbox", { name: `Row ${row} ${field}` }) as HTMLInputElement;
const LONG = { timeout: 3000 };

describe("the drilling sheet", () => {
  it("shows the latest holes read-only, with the new rows below", async () => {
    await show();
    expect(box(1, "Hole ID").value).toBe("DH-001");
    expect(box(1, "Hole ID").readOnly).toBe(true);
    // A locked hole's status is read-only text, like the rest of its row.
    expect(box(1, "Status").value).toBe(en.drilling.status.ONGOING);
    expect(box(1, "Status").readOnly).toBe(true);
    expect(box(2, "Hole ID").readOnly).toBe(false);
    expect(box(2, "Hole ID").value).toBe("");
  });

  it("offers the statuses as a list on a row that can be changed, and sends the one picked", async () => {
    await show();
    const status = () => screen.getByRole("combobox", { name: "Row 2 Status" }) as HTMLSelectElement;
    expect([...status().options].map((option) => option.text)).toEqual([
      "—",
      ...(["PLANNED", "ONGOING", "COMPLETED", "ABANDONED"] as const).map((key) => en.drilling.status[key]),
    ]);

    fireEvent.change(box(2, "Hole ID"), { target: { value: "DH-300" } });
    fireEvent.change(status(), { target: { value: en.drilling.status.COMPLETED } });
    expect(status().value).toBe(en.drilling.status.COMPLETED);

    const save = await screen.findByRole("button", { name: "Save 1 row" }, LONG);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), LONG);
    fireEvent.click(save);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/drilling"), LONG);
    expect(sent.at(-1)?.rows).toEqual([{ line: 2, cells: { holeId: "DH-300", status: en.drilling.status.COMPLETED } }]);
  });

  it("shows a pasted status by its name, however the sheet wrote it", async () => {
    await show();
    fireEvent.paste(box(2, "Hole ID"), {
      clipboardData: { getData: () => "Hole ID\tStatus\nDH-1\tCOMPLETED\nDH-2\tselesai\nDH-3\tsomeday" },
    });
    const status = (row: number) => (screen.getByRole("combobox", { name: `Row ${row} Status` }) as HTMLSelectElement).value;
    expect([status(2), status(3), status(4)]).toEqual([en.drilling.status.COMPLETED, en.drilling.status.COMPLETED, "someday"]);
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
    await show();
    fireEvent.click(screen.getByRole("button", { name: en.drilling.sheet.unlock }));
    expect(box(1, en.drilling.fields.totalDepth).readOnly).toBe(false);
    fireEvent.change(box(1, en.drilling.fields.totalDepth), { target: { value: "150" } });
    fireEvent.change(box(2, "Hole ID"), { target: { value: "DH-200" } });

    const save = await screen.findByRole("button", { name: "Save 2 rows" }, LONG);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), LONG);
    fireEvent.click(save);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/drilling"), LONG);

    const saved = sent.at(-1)!;
    expect(saved.dryRun).toBe(false);
    expect(saved.rows).toEqual([
      { line: 1, id: "h1", cells: expect.objectContaining({ holeId: "DH-001", totalDepth: "150" }) },
      { line: 2, cells: { holeId: "DH-200" } },
    ]);
  });

  it("puts a hole back as it was when it is locked again", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: en.drilling.sheet.unlock }));
    fireEvent.change(box(1, en.drilling.fields.totalDepth), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: en.drilling.sheet.lock }));
    expect(box(1, en.drilling.fields.totalDepth).value).toBe("120");
    expect(box(1, en.drilling.fields.totalDepth).readOnly).toBe(true);
  });

  it("opened from a hole's Ubah, has that hole unlocked already", async () => {
    await show(HOLE);
    expect(screen.getByRole("heading", { name: "Edit DH-001" })).toBeTruthy();
    expect(box(1, "Hole ID").readOnly).toBe(false);
    expect(screen.getByRole("button", { name: en.drilling.sheet.lock })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(box(1, "Hole ID")), LONG);
  });

  it("brings an older hole onto the sheet, unlocked, right above the empty rows", async () => {
    const older: DrillHoleDTO = { ...HOLE, id: "h0", holeId: "DH-000", totalDepth: 40 };
    await show(older);
    expect(box(1, "Hole ID").value).toBe("DH-001");
    expect(box(1, "Hole ID").readOnly).toBe(true);
    expect(box(2, "Hole ID").value).toBe("DH-000");
    expect(box(2, "Hole ID").readOnly).toBe(false);
    expect(box(3, "Hole ID").value).toBe("");

    fireEvent.change(box(2, en.drilling.fields.totalDepth), { target: { value: "45" } });
    const save = await screen.findByRole("button", { name: "Save 1 row" }, LONG);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false), LONG);
    fireEvent.click(save);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/drilling"), LONG);
    expect(sent.at(-1)?.rows).toEqual([{ line: 2, id: "h0", cells: expect.objectContaining({ totalDepth: "45" }) }]);
  });

  it("says above the sheet how many holes are locked, until something is entered", async () => {
    await show();
    expect(screen.getByText("The latest hole is locked above — click its lock to change it.")).toBeTruthy();
    fireEvent.change(box(2, "Hole ID"), { target: { value: "DH-500" } });
    expect(screen.queryByText("The latest hole is locked above — click its lock to change it.")).toBeNull();
  });

  it("goes straight back to the list when nothing was entered", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    expect(push).toHaveBeenCalledWith("/eksplorasi/drilling");
  });

  it("asks before leaving work that is not saved, and stays until told to go", async () => {
    await show();
    fireEvent.change(box(2, "Hole ID"), { target: { value: "DH-400" } });
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    const dialog = await screen.findByRole("dialog", { name: en.drilling.sheet.leaveTitle });
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: en.common.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(box(2, "Hole ID").value).toBe("DH-400");

    fireEvent.click(screen.getByRole("button", { name: en.drilling.sheet.back }));
    fireEvent.click(await screen.findByRole("button", { name: en.drilling.sheet.leave }));
    expect(push).toHaveBeenCalledWith("/eksplorasi/drilling");
  });
});
