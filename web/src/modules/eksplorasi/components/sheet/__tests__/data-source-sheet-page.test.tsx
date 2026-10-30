// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { DataSourceSheetPage } from "@/modules/eksplorasi/components/sheet/data-source-sheet-page";
import { ELEMENT_FIELDS } from "@/modules/eksplorasi/lib/data-source-columns";
import type { DataSourceDTO, DataSourceView, SheetVerdict } from "@/modules/eksplorasi/types";

vi.mock("@/core/components/ui/toast", () => ({ toast: vi.fn() }));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/**
 * A list's sheet, on its own page: the list's latest rows on top, read-only
 * until unlocked, new rows typed or pasted below, every active row checked,
 * and Save sending the new rows and the unlocked ones together -- with the
 * list's own columns, and on a QC list its own type.
 */

const ROW: DataSourceDTO = {
  id: "r1",
  controlDate: null,
  control: null,
  campaign: "C1",
  no: null,
  holeId: "DH-1",
  sampleId: "S-001",
  sampleType: "FIELD",
  from: "10",
  to: "11",
  originalSampleIdRemarks: null,
  oreasRemarks: null,
  date: "2026-10-01",
  weight: "2.5",
  ...(Object.fromEntries(ELEMENT_FIELDS.map((field) => [field, null])) as Record<(typeof ELEMENT_FIELDS)[number], null>),
  ni: "1.5",
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

/** The CRM List's standards, as /api/crm-list/standard answers. */
const OREAS = [
  { id: "c1", standard: "Oreas184", testMethod: "Fusion XRF", ni: "1.02", co: "0.09", fe2o3: "39.30", al2o3: "4.62", cr2o3: "1.75" },
  { id: "c2", standard: "Oreas189", testMethod: "Fusion XRF", ni: "1.48", co: "0.03", fe2o3: "15.04", al2o3: "2.09", cr2o3: "7.65" },
];

/** The FIELD samples /api/data-sources/sample-ids searches: more than one answer holds. */
const FIELD_IDS = Array.from({ length: 60 }, (_, index) => `DMY-A-${String(index + 1).padStart(5, "0")}`);
let searched: URLSearchParams[] = [];

type Sent = { dryRun: boolean; view: string; rows: { line: number; id?: string; cells: Record<string, string> }[] };
let sent: Sent[] = [];
let listed: string[] = [];
/** The list's latest samples, as /api/data-sources answers. */
let latest: DataSourceDTO[] = [];

beforeEach(() => {
  sent = [];
  listed = [];
  latest = [ROW];
  searched = [];
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/crm-list/standard")) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: OREAS }) };
      }
      if (url.startsWith("/api/data-sources/sample-ids?")) {
        const params = new URLSearchParams(url.split("?")[1]);
        searched.push(params);
        const data = FIELD_IDS.filter((id) => id.includes(params.get("search") ?? "")).slice(0, Number(params.get("limit")));
        return { ok: true, status: 200, json: async () => ({ success: true, data }) };
      }
      if (url.startsWith("/api/data-sources?")) {
        listed.push(url);
        const data = { rows: latest, pagination: { page: 1, pageSize: 50, total: latest.length, totalPages: 1 } };
        return { ok: true, json: async () => ({ success: true, data }) };
      }
      const body = JSON.parse(String(init?.body)) as Sent;
      sent.push(body);
      const rows: SheetVerdict[] = body.rows.map((row) => ({ line: row.line, status: row.id ? "update" : "create" }));
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

async function show(view: DataSourceView = "dataSource", editing?: DataSourceDTO) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <DataSourceSheetPage view={view} editing={editing} />
    </NextIntlClientProvider>
  );
  await screen.findByRole("textbox", { name: "Row 1 Sample ID" }, { timeout: 3000 });
}

const box = (row: number, field: string) => screen.getByRole("textbox", { name: `Row ${row} ${field}` }) as HTMLInputElement;
const LONG = { timeout: 3000 };
const types = en.dataSource.sampleType;

async function save(name: string) {
  const button = await screen.findByRole("button", { name }, LONG);
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false), LONG);
  fireEvent.click(button);
}

describe("a list's sheet", () => {
  it("shows the list's latest rows read-only, with the new rows below, in the list's columns", async () => {
    await show();
    expect(listed[0]).toContain("view=dataSource");
    expect(box(1, "Sample ID").value).toBe("S-001");
    expect(box(1, "Sample ID").readOnly).toBe(true);
    expect(box(1, "Sample Type").value).toBe(types.FIELD);
    expect(box(1, "Ni").value).toBe("1.5");
    expect(box(2, "Sample ID").readOnly).toBe(false);
    // The data source has no Control column; the duplicate list does.
    expect(screen.queryByRole("textbox", { name: "Row 1 Control" })).toBeNull();
  });

  it("offers the sample types as a list that can be searched, and sends the one picked", async () => {
    await show();
    const type = () => screen.getByRole("combobox", { name: "Row 2 Sample Type" });
    fireEvent.click(type());
    const options = await screen.findAllByRole("option", {}, LONG);
    expect(options.map((option) => option.textContent)).toEqual([
      "—",
      ...(["FIELD", "STANDARD", "BLANK", "DUPLICATE"] as const).map((key) => types[key]),
    ]);

    const search = await screen.findByRole("combobox", { name: en.dataSource.sheet.typeSearch }, LONG);
    fireEvent.change(search, { target: { value: "bla" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: types.FIELD })).toBeNull(), LONG);
    fireEvent.click(await screen.findByRole("option", { name: types.BLANK }, LONG));
    await waitFor(() => expect(type().textContent).toContain(types.BLANK), LONG);

    fireEvent.change(box(2, "Sample ID"), { target: { value: "S-300" } });

    await save("Save 1 row");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/data-source"), LONG);
    expect(sent.at(-1)).toMatchObject({ view: "dataSource", rows: [{ line: 2, cells: { sampleId: "S-300", sampleType: types.BLANK } }] });
  });

  it("shows a pasted type by its name, however the sheet wrote it", async () => {
    await show();
    fireEvent.paste(box(2, "Sample ID"), {
      clipboardData: { getData: () => "Sample ID\tSample Type\nS-1\tSTD\nS-2\tstandart\nS-3\tsomeday" },
    });
    const type = (row: number) => screen.getByRole("combobox", { name: `Row ${row} Sample Type` }).textContent;
    expect([type(2), type(3), type(4)]).toEqual([types.STANDARD, types.STANDARD, "someday"]);
  });

  it("spreads a block pasted with its header across the new rows", async () => {
    await show();
    fireEvent.paste(box(2, "Sample ID"), {
      clipboardData: { getData: () => "Sample ID\tNi (%)\tCampaign\nS-100\t1,25\tC2\nS-101\t<0.01\t" },
    });
    expect([box(2, "Sample ID").value, box(2, "Ni").value, box(2, "Campaign").value]).toEqual(["S-100", "1,25", "C2"]);
    expect(box(3, "Ni").value).toBe("<0.01");
    // A paste never reaches the locked row above.
    expect(box(1, "Sample ID").value).toBe("S-001");
  });

  it("picks Date from a calendar, takes a pasted day-first date into it, and shows a pasted non-date as text", async () => {
    await show();
    const date = (row: number) => screen.getByLabelText(`Row ${row} Date`) as HTMLInputElement;
    // The loaded sample's date, in a calendar box it cannot change while locked.
    expect([date(1).type, date(1).value, date(1).readOnly]).toEqual(["date", "2026-10-01", true]);

    fireEvent.paste(box(2, "Sample ID"), {
      clipboardData: { getData: () => "Sample ID\tDate\nS-100\t01/10/2026\nS-101\t10" },
    });
    expect([date(2).type, date(2).value]).toEqual(["date", "2026-10-01"]);
    // Up and down step the calendar box's own day, month and year; they do not leave the box.
    act(() => date(2).focus());
    fireEvent.keyDown(date(2), { key: "ArrowDown" });
    expect(document.activeElement).toBe(date(2));
    // "10" is no date -- a To, one box over -- so it stays in sight for the check to mark.
    expect([date(3).type, date(3).value]).toEqual(["text", "10"]);

    fireEvent.change(date(3), { target: { value: "" } });
    expect(date(3).type).toBe("date");
  });

  it("picks the Duplicate list's Control Date from a calendar too", async () => {
    await show("duplicate");
    const controlDate = screen.getByLabelText("Row 2 Control Date") as HTMLInputElement;
    expect(controlDate.type).toBe("date");
    fireEvent.paste(box(2, "Sample ID"), { clipboardData: { getData: () => "Sample ID\tControl Date\nD-100\t15/09/2026" } });
    expect((screen.getByLabelText("Row 2 Control Date") as HTMLInputElement).value).toBe("2026-09-15");
  });

  it("unlocks a row to change it, and saves it with the new rows", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: en.dataSource.sheet.unlock }));
    expect(box(1, "Ni").readOnly).toBe(false);
    fireEvent.change(box(1, "Ni"), { target: { value: "1.55" } });
    fireEvent.change(box(2, "Sample ID"), { target: { value: "S-200" } });

    await save("Save 2 rows");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/data-source"), LONG);
    expect(sent.at(-1)!.rows).toEqual([
      { line: 1, id: "r1", cells: expect.objectContaining({ sampleId: "S-001", ni: "1.55" }) },
      { line: 2, cells: { sampleId: "S-200" } },
    ]);
  });

  it("puts a row back as it was when it is locked again", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: en.dataSource.sheet.unlock }));
    fireEvent.change(box(1, "Ni"), { target: { value: "9.99" } });
    fireEvent.click(screen.getByRole("button", { name: en.dataSource.sheet.lock }));
    expect(box(1, "Ni").value).toBe("1.5");
    expect(box(1, "Ni").readOnly).toBe(true);
  });

  it("on a QC list, shows the list's type in every row and never sends one typed", async () => {
    await show("duplicate");
    expect(listed[0]).toContain("view=duplicate");
    expect(box(2, "Sample Type").value).toBe(types.DUPLICATE);
    expect(box(2, "Sample Type").readOnly).toBe(true);
    expect(screen.getByRole("textbox", { name: "Row 2 Control" })).toBeTruthy();

    fireEvent.paste(box(2, "Sample ID"), { clipboardData: { getData: () => "Sample ID\tSample Type\tControl\nD-1\tBlank\tS-001" } });
    await save("Save 1 row");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/duplicate"), LONG);
    expect(sent.at(-1)).toMatchObject({ view: "duplicate", rows: [{ line: 2, cells: { sampleId: "D-1", control: "S-001" } }] });
  });

  it("opened from a row's edit, has that row unlocked already", async () => {
    await show("dataSource", ROW);
    expect(screen.getByRole("heading", { name: "Edit S-001" })).toBeTruthy();
    expect(box(1, "Sample ID").readOnly).toBe(false);
    expect(screen.getByRole("button", { name: en.dataSource.sheet.lock })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(box(1, "Campaign")), LONG);
  });

  it("brings an older row onto the sheet, unlocked, right above the empty rows", async () => {
    const older: DataSourceDTO = { ...ROW, id: "r0", sampleId: "S-000", ni: "0.9" };
    await show("dataSource", older);
    expect(box(1, "Sample ID").value).toBe("S-001");
    expect(box(1, "Sample ID").readOnly).toBe(true);
    expect(box(2, "Sample ID").value).toBe("S-000");
    expect(box(2, "Sample ID").readOnly).toBe(false);
    expect(box(3, "Sample ID").value).toBe("");
  });

  // No scroll box of its own: every row is on the page, the last empty one too.
  it("draws every row, so the sheet needs no scrollbar of its own", async () => {
    await show();
    expect(box(21, "Sample ID").value).toBe("");
    expect(screen.queryByRole("textbox", { name: "Row 22 Sample ID" })).toBeNull();
  });

  it("says above the sheet how many rows are locked, until something is entered", async () => {
    await show();
    const hint = "The latest row is locked above — click the padlock to change it.";
    expect(screen.getByText(hint)).toBeTruthy();
    fireEvent.change(box(2, "Sample ID"), { target: { value: "S-500" } });
    expect(screen.queryByText(hint)).toBeNull();
  });

  it("asks before leaving work that is not saved, and stays until told to go", async () => {
    await show("standard");
    fireEvent.change(box(2, "Sample ID"), { target: { value: "S-400" } });
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    const dialog = await screen.findByRole("dialog", { name: en.dataSource.sheet.leaveTitle });
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: en.common.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(box(2, "Sample ID").value).toBe("S-400");

    fireEvent.click(screen.getByRole("button", { name: en.dataSource.views.standard.title }));
    fireEvent.click(await screen.findByRole("button", { name: en.dataSource.sheet.leave }));
    expect(push).toHaveBeenCalledWith("/eksplorasi/standard");
  });
});

describe("the OREAS Remarks", () => {
  const remarks = (row: number) => screen.findByRole("combobox", { name: `Row ${row} Remarks` }, LONG);

  /** Opens a row's Remarks, searches it, and picks the one name left. */
  async function pick(row: number, search: string, name: string) {
    fireEvent.click(await remarks(row));
    const box = await screen.findByRole("combobox", { name: en.dataSource.sheet.oreasSearch }, LONG);
    fireEvent.change(box, { target: { value: search } });
    fireEvent.click(await screen.findByRole("option", { name }, LONG));
  }

  it("is filled with the standard whose five values were typed, while Remarks is empty", async () => {
    await show();
    const values = { Ni: "1.020", Co: "0.09", Fe2O3: "39.3", Al2O3: "4.62", Cr2O3: "1.75" };
    // The CRM List arrives a moment after the sheet: asked for, then its answer read.
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/crm-list/standard", expect.anything()), LONG);
    await act(async () => {});
    for (const [field, value] of Object.entries(values)) fireEvent.change(box(2, field), { target: { value } });
    await waitFor(async () => expect((await remarks(2)).textContent).toContain("Oreas184"), LONG);

    // A remark somebody picked stays: a value changed again does not replace it.
    await pick(2, "189", "Oreas189");
    await waitFor(async () => expect((await remarks(2)).textContent).toContain("Oreas189"), LONG);
    fireEvent.change(box(2, "Ni"), { target: { value: "1.02" } });
    expect((await remarks(2)).textContent).toContain("Oreas189");
  }, 60_000);

  it.each(["dataSource", "standard", "blank"] as const)(
    "is picked on the %s list from the OREAS standards, and the list can be searched",
    async (view) => {
      await show(view);
      fireEvent.click(await remarks(2));
      const search = await screen.findByRole("combobox", { name: en.dataSource.sheet.oreasSearch }, LONG);
      fireEvent.change(search, { target: { value: "189" } });
      await waitFor(() => expect(screen.queryByRole("option", { name: "Oreas184" })).toBeNull(), LONG);
      fireEvent.click(await screen.findByRole("option", { name: "Oreas189" }, LONG));
      await waitFor(async () => expect((await remarks(2)).textContent).toContain("Oreas189"), LONG);
    },
    60_000
  );
});

describe("the Duplicate list's Remarks", () => {
  const remarks = (row: number) => screen.findByRole("combobox", { name: `Row ${row} Remarks` }, LONG);
  const sheet = en.dataSource.sheet;

  it("is a FIELD sample's Sample ID, searched on the server as it is typed, and saved", async () => {
    await show("duplicate");
    // Nothing is asked until the box is opened.
    expect(searched).toHaveLength(0);
    fireEvent.click(await remarks(2));
    expect(await screen.findByRole("option", { name: "DMY-A-00001" }, LONG)).toBeTruthy();
    // One answer holds 50 of the 60: typing more narrows it.
    expect(await screen.findByText(sheet.sampleIdNarrow.replace("{count}", "50"), {}, LONG)).toBeTruthy();
    expect(screen.queryByRole("option", { name: "DMY-A-00051" })).toBeNull();

    const search = await screen.findByRole("combobox", { name: sheet.sampleIdSearch }, LONG);
    fireEvent.change(search, { target: { value: "0009" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: "DMY-A-00001" })).toBeNull(), LONG);
    expect(searched.at(-1)?.get("search")).toBe("0009");
    fireEvent.click(await screen.findByRole("option", { name: "DMY-A-00009" }, LONG));
    await waitFor(async () => expect((await remarks(2)).textContent).toContain("DMY-A-00009"), LONG);

    fireEvent.change(box(2, "Sample ID"), { target: { value: "D-9" } });
    await save("Save 1 row");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/duplicate"), LONG);
    expect(sent.at(-1)).toMatchObject({ rows: [{ line: 2, cells: { sampleId: "D-9", originalSampleIdRemarks: "DMY-A-00009" } }] });
  }, 60_000);

  it("keeps a remark that is not a Sample ID visible, as its own choice", async () => {
    const old: DataSourceDTO = { ...ROW, id: "r9", sampleId: "D-OLD", sampleType: "DUPLICATE", originalSampleIdRemarks: "Field duplicate" };
    await show("duplicate", old);
    expect((await remarks(2)).textContent).toContain("Field duplicate");
    fireEvent.click(await remarks(2));
    expect(await screen.findByRole("option", { name: "Field duplicate" }, LONG)).toBeTruthy();
    expect(await screen.findByRole("option", { name: "DMY-A-00001" }, LONG)).toBeTruthy();
  }, 60_000);

  it("says so when no FIELD sample matches", async () => {
    await show("duplicate");
    fireEvent.click(await remarks(2));
    fireEvent.change(await screen.findByRole("combobox", { name: sheet.sampleIdSearch }, LONG), { target: { value: "ZZZ" } });
    expect(await screen.findByText(sheet.sampleIdNoResults, {}, LONG)).toBeTruthy();
  }, 60_000);
});

describe("a sample without assay results", () => {
  /** No element filled in yet: only who and where the sample is. The list answers newest first. */
  const bare: DataSourceDTO = {
    ...ROW,
    id: "r2",
    sampleId: "S-002",
    ...(Object.fromEntries(ELEMENT_FIELDS.map((field) => [field, null])) as Record<(typeof ELEMENT_FIELDS)[number], null>),
  };

  it("comes onto the sheet unlocked, ready for its results, and saves them as a change", async () => {
    latest = [bare, ROW];
    await show();
    expect(box(1, "Sample ID").value).toBe("S-001");
    expect(box(1, "Ni").readOnly).toBe(true);
    expect(box(2, "Sample ID").value).toBe("S-002");
    expect(box(2, "Ni").readOnly).toBe(false);
    expect(screen.getByRole("button", { name: en.dataSource.sheet.lock })).toBeTruthy();
    expect(screen.getByText(/The latest row is locked above.*1 sample without assay results is open/)).toBeTruthy();

    fireEvent.change(box(2, "Ni"), { target: { value: "1.1" } });
    await save("Save 1 row");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/eksplorasi/data-source"), LONG);
    expect(sent.at(-1)?.rows).toEqual([expect.objectContaining({ line: 2, id: "r2", cells: expect.objectContaining({ ni: "1.1" }) })]);
  });

  it("is open on a QC list's sheet too, and goes back to open on Clear", async () => {
    latest = [{ ...bare, sampleType: "STANDARD" }, { ...ROW, sampleType: "STANDARD" }];
    await show("standard");
    expect(box(2, "Ni").readOnly).toBe(false);
    fireEvent.change(box(2, "Ni"), { target: { value: "1.1" } });
    fireEvent.click(screen.getByRole("button", { name: en.dataSource.sheet.clear }));
    await waitFor(() => expect(box(2, "Ni").value).toBe(""));
    expect(box(2, "Ni").readOnly).toBe(false);
    expect(box(1, "Ni").readOnly).toBe(true);
  });
});
