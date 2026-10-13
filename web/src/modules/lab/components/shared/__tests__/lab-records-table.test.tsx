// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { LabRecordsTable, type LabRecordsAccess } from "@/modules/lab/components/shared/lab-records-table";
import { resetPersistedColumns } from "@/core/hooks/use-persisted-columns";
import { resetTableLayouts } from "@/core/hooks/use-table-layout";
import { ASSAY_FIELDS, INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";

let query = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/database",
  useSearchParams: () => query,
}));

const RECORDS = [
  {
    ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, null])),
    ni: 1.86,
    id: "r1",
    labCode: "SPR.QLAB.20260918.001",
    sampleIdent: "MOL/LIM/S2/PA4/B489/1.1/25",
    shiftDate: "2026-09-18",
    remarks: null,
    measurementMethod: "STARGATE_LG-GEO",
    solutionId: "866",
    // 12:28 on the lab's clock, which is UTC+8.
    measurementFinished: "2026-09-11T04:28:00.000Z",
    sample: {
      id: "s1",
      sampleCode: "NKL-2026-00001",
      status: "PENDING",
      currentStage: null,
    },
  },
  // Nothing entered yet.
  {
    ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, null])),
    id: "r2",
    labCode: "SPR.QLAB.20260918.002",
    sampleIdent: null,
    shiftDate: "2026-09-18",
    remarks: null,
    measurementMethod: null,
    solutionId: null,
    measurementFinished: null,
    sample: { id: "s2", sampleCode: "NKL-2026-00002", status: "PENDING", currentStage: null },
  },
];

let deleteCalls: unknown[] = [];
/** Sub-samples the first record carries, for the tests that need them. */
let firstSubs: unknown[] = [];
let subDeleteCalls: unknown[] = [];
/** How many records the filters "match"; the first page always shows RECORDS. */
let listTotal = 2;
let listCalls: string[] = [];

/**
 * `count` distinct records, for a "select all that match" answer: the page's
 * own rows first, as the real list returns them, then more.
 */
function matching(count: number) {
  return [...RECORDS, ...Array.from({ length: count - RECORDS.length }, (_, index) => ({
    ...RECORDS[index % RECORDS.length],
    id: `m${index}`,
    labCode: `SPR.QLAB.20260918.${String(index + 1).padStart(3, "0")}`,
    sample: { ...RECORDS[index % RECORDS.length].sample, id: `ms${index}`, sampleCode: `NKL-M-${index}` },
  }))];
}

function stubFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/lab-records/subs")) {
      subDeleteCalls.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => ({ success: true, data: { removed: 1 } }) };
    }
    if (String(url).startsWith("/api/samples/delete")) {
      deleteCalls.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => ({ success: true, data: { changed: 1 } }) };
    }
    if (String(url).startsWith("/api/lab-records")) {
      listCalls.push(String(url));
      const all = new URL(String(url), "http://x").searchParams.get("pageSize") === "200";
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            records: all
              ? matching(Math.min(listTotal, 200))
              : RECORDS.map((record) => (record.id === "r1" ? { ...record, subs: firstSubs } : record)),
            pagination: { page: 1, pageSize: 25, total: listTotal, totalPages: Math.ceil(listTotal / 25) },
            counts: { missing: 1, present: 1 },
          },
        }),
      };
    }
    if (String(url).startsWith("/api/master-options")) {
      return { ok: true, json: async () => ({ success: true, data: { options: [] } }) };
    }
    throw new Error(`unexpected request: ${url}`);
  });
}

/** The Database role: may do everything on this table. */
const FULL: LabRecordsAccess = { canEdit: true, canExport: true, canViewDeleted: true };
/** A role with no rights on the table beyond reading it. */
const NONE: LabRecordsAccess = { canEdit: false, canExport: false, canViewDeleted: false };
/** An administrator: reads, exports and sees the deleted view, changes nothing. */
const READ_ONLY_ADMIN: LabRecordsAccess = { canEdit: false, canExport: true, canViewDeleted: true };

function show(canEdit: boolean | LabRecordsAccess = true) {
  const access = typeof canEdit === "boolean" ? (canEdit ? FULL : NONE) : canEdit;
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <LabRecordsTable access={access} />
    </NextIntlClientProvider>
  );
}

/** Waits for the one data row, not for the header that is there from the start. */
async function row() {
  await waitFor(() => screen.getByText("NKL-2026-00001"));
  return screen.getAllByRole("row")[1];
}

beforeEach(() => {
  query = new URLSearchParams();
  deleteCalls = [];
  firstSubs = [];
  subDeleteCalls = [];
  listTotal = 2;
  listCalls = [];
  window.localStorage.clear();
  resetPersistedColumns();
  resetTableLayouts();
  vi.stubGlobal("fetch", stubFetch());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("one column names the row", () => {
  /**
   * Three code columns used to compete for the job. The barcode code leads --
   * it is what is scanned off the container -- with the lab code and the
   * Sample ID beneath it in the same cell.
   */
  it("leads with the sample, carrying all three codes", async () => {
    show(false);
    const first = await row();

    const headers = [...screen.getAllByRole("row")[0].querySelectorAll("th")].map((cell) =>
      cell.textContent?.trim()
    );
    expect(headers[0]).toContain(en.database.sampleColumn);
    expect(headers).not.toContain(en.samples.labCode);
    expect(headers).not.toContain(en.database.sampleIdent);

    const cell = first.querySelectorAll("td")[0];
    expect(cell.textContent).toContain("NKL-2026-00001");
    expect(cell.textContent).toContain("SPR.QLAB.20260918.001");
    expect(cell.textContent).toContain("MOL/LIM/S2/PA4/B489/1.1/25");
  });

  it("puts the unit on the header, not on every value", async () => {
    show(false);
    await row();
    expect(screen.getByRole("columnheader", { name: /Ni %/ })).toBeTruthy();
    expect(screen.getByText("1.86")).toBeTruthy();
  });

  // A header cell short of the body is how a colSpan goes crooked.
  it("keeps the header and the body the same width, with and without tick boxes", async () => {
    for (const canEdit of [true, false]) {
      show(canEdit);
      const first = await row();
      expect(first.querySelectorAll("td").length).toBe(
        screen.getAllByRole("row")[0].querySelectorAll("th").length
      );
      cleanup();
    }
  });

  it("offers no tick boxes to somebody who cannot delete", async () => {
    show(false);
    await row();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("lets an administrator read, export and look at what was deleted, and change nothing", async () => {
    show(READ_ONLY_ADMIN);
    await row();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByRole("tablist", { name: en.database.viewLabel })).toBeTruthy();
    expect(screen.getByRole("button", { name: en.common.export })).toBeTruthy();
  });
});

describe("opening a row", () => {
  it("shows every element and the way to edit, beside the list", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    // The lab code, not the sample code beside it: that one is a link to the
    // sample now, and opening the panel is what the rest of the row does.
    await user.click(within(await row()).getByText(/SPR\.QLAB\.20260918\.001/));

    const panel = await screen.findByRole("dialog");
    // All eighteen, not just the five the table shows as columns.
    for (const field of ASSAY_FIELDS) {
      expect(within(panel).getByText(field.shortLabel)).toBeTruthy();
    }
    expect(within(panel).getByRole("button", { name: en.common.edit })).toBeTruthy();
    expect(within(panel).getByRole("link", { name: en.database.sheet.openSample })).toBeTruthy();
  });

  it("opens from the keyboard too", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    (await row()).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("does not open when the tick box is what was clicked", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await user.click(within(await row()).getByRole("checkbox"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the instrument's own columns", () => {
  async function openPicker(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: en.common.columns }));
  }

  it("offers all three, and shows none of them until asked", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    expect(screen.queryByText("STARGATE_LG-GEO")).toBeNull();
    await openPicker(user);
    for (const name of ["Measurement Method", "Solution ID", "Measurement Finished"]) {
      const item = await screen.findByRole("menuitemcheckbox", { name });
      expect(item.getAttribute("aria-checked")).toBe("false");
    }
  });

  it("prints the measurement time on the lab's clock", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    await openPicker(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Measurement Finished" }));
    await user.keyboard("{Escape}");

    expect(await screen.findByText("2026-09-11 12:28:00")).toBeTruthy();
  });

  it("remembers the choice for the next visit", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    await openPicker(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Measurement Method" }));
    await user.keyboard("{Escape}");
    cleanup();

    // A fresh page load: the in-memory store is gone, localStorage is not.
    resetPersistedColumns();
    show();
    await row();
    expect(await screen.findByText("STARGATE_LG-GEO")).toBeTruthy();
  });
});

describe("deleting and restoring", () => {
  it("asks before deleting, then sends the sample ids", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await user.click(within(await row()).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: en.database.remove }));

    // Nothing has happened yet: the dialog is the second chance.
    const dialog = await screen.findByRole("dialog");
    expect(deleteCalls).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: en.database.remove }));

    await waitFor(() => expect(deleteCalls).toHaveLength(1));
    // The flag lives on the sample, not on its lab record.
    expect(deleteCalls[0]).toEqual({ ids: ["s1"], restore: false });
    await waitFor(() => expect(screen.queryByText(/row\(s\) selected/)).toBeNull());
  });

  it("can be called off", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await user.click(within(await row()).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: en.database.remove }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: en.common.cancel }));

    expect(deleteCalls).toHaveLength(0);
  });

  it("restores from the deleted view, and asks the server for deleted rows", async () => {
    const user = userEvent.setup({ delay: null });
    const fetchSpy = stubFetch();
    vi.stubGlobal("fetch", fetchSpy);
    query = new URLSearchParams("deleted=true");
    show();

    await user.click(within(await row()).getByRole("checkbox"));
    expect(screen.queryByRole("button", { name: en.database.remove })).toBeNull();
    await user.click(screen.getByRole("button", { name: en.database.restore }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: en.database.restore }));

    await waitFor(() => expect(deleteCalls).toHaveLength(1));
    expect(deleteCalls[0]).toEqual({ ids: ["s1"], restore: true });
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("deleted=true"))).toBe(true);
  });

  it("is a view switch, not a button that looks like delete", async () => {
    show();
    await row();
    expect(screen.getByRole("tab", { name: en.database.deletedView })).toBeTruthy();
    expect(screen.getByRole("tab", { name: en.database.activeView }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("the layout around the table", () => {
  it("says how many rows the filters found, above the table", async () => {
    show();
    await row();
    expect(screen.getByText("2 sample(s)")).toBeTruthy();
  });

  it("puts the results filter in the toolbar, with its counts", async () => {
    show();
    await row();
    const results = screen.getByRole("combobox", { name: en.database.filters.resultsLabel });
    expect(results.textContent).toContain("All (2)");
  });

  it("asks the server for the counts", async () => {
    const fetchSpy = stubFetch();
    vi.stubGlobal("fetch", fetchSpy);
    show();
    await row();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("counts=true"))).toBe(true);
  });

  it("shows a dash per column for a row with nothing entered, one cell per heading", async () => {
    show();
    await row();
    const empty = screen.getByText("NKL-2026-00002").closest("tr") as HTMLElement;

    // No merged cell any more: the columns can be moved, so the result
    // columns need not sit side by side.
    expect(empty.querySelector("td[colspan]")).toBeNull();
    expect(within(empty).getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(empty.querySelectorAll("td").length).toBe(
      screen.getAllByRole("row")[0].querySelectorAll("th").length
    );
  });
});

describe("picking samples to enter results for (assay mode)", () => {
  type Handler = (records: { id: string }[]) => void;

  function showAssay() {
    const onPaste = vi.fn<Handler>();
    const onEnterResults = vi.fn<Handler>();
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
        <LabRecordsTable access={FULL} mode="assay" onPaste={onPaste} onEnterResults={onEnterResults} onImport={vi.fn()} />
      </NextIntlClientProvider>
    );
    return { onPaste, onEnterResults };
  }

  it("opens on the samples still waiting for a result", async () => {
    const fetchSpy = stubFetch();
    vi.stubGlobal("fetch", fetchSpy);
    showAssay();
    await row();

    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("results=missing"))).toBe(true);
    expect(
      screen.getByRole("button", { name: /No result yet/ }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("offers neither export nor the deleted view", async () => {
    showAssay();
    await row();
    expect(screen.queryByRole("tab", { name: en.database.deletedView })).toBeNull();
    expect(screen.queryByRole("button", { name: en.common.export })).toBeNull();
    expect(screen.getByRole("button", { name: en.database.importFile })).toBeTruthy();
  });

  it("folds a sample's sub-samples behind an arrow, and removes them apart from samples", async () => {
    firstSubs = [
      {
        ...RECORDS[0],
        id: "r1-sub",
        parentId: "r1",
        subCode: "-20",
        labCode: "SPR.QLAB.20260918.001 (-20)",
        sampleIdent: "MOL/LIM/S2/PA4/B489/1.1/25 (-20)",
        ni: 2.1,
      },
    ];
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup({ delay: null });
    showAssay();
    await row();

    // Folded at first: an arrow pointing right, no sub row.
    expect(screen.queryByText("Sub-sample (-20)")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show or hide 1 sub-sample" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("1 sub")).toBeTruthy();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The arrow is not a tick: the sample row stays as it was.
    expect((screen.getByRole("checkbox", { name: "NKL-2026-00001" }) as HTMLInputElement).checked).toBe(false);

    const rows = screen.getAllByRole("row").slice(1);
    // Straight after its sample, before the next one.
    expect(within(rows[1]).getByText("Sub-sample (-20)")).toBeTruthy();
    expect(within(rows[2]).getByText("NKL-2026-00002")).toBeTruthy();

    await user.click(within(rows[1]).getByRole("checkbox", { name: "SPR.QLAB.20260918.001 (-20)" }));
    await user.click(screen.getByRole("button", { name: "Remove sub-sample" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: en.database.subs.removeShort }));

    await waitFor(() => expect(subDeleteCalls).toEqual([{ ids: ["r1-sub"] }]));
    expect(deleteCalls).toEqual([]);
  });

  it("opens the subs without ticking the row when the arrow's icon is what was clicked", async () => {
    firstSubs = [{ ...RECORDS[0], id: "r1-sub", parentId: "r1", subCode: "-20", labCode: "SPR.QLAB.20260918.001 (-20)" }];
    vi.stubGlobal("fetch", stubFetch());
    showAssay();
    await row();

    // A mouse lands on the icon, not on the button around it.
    const toggle = screen.getByRole("button", { name: "Show or hide 1 sub-sample" });
    fireEvent.click(toggle.querySelector("svg")!);

    expect(screen.getByText("Sub-sample (-20)")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "NKL-2026-00001" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText("1 row(s) selected")).toBeNull();

    // The history icon, the same way.
    fireEvent.click(screen.getByRole("button", { name: "History of NKL-2026-00001" }).querySelector("svg")!);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", { name: "NKL-2026-00001", hidden: true }) as HTMLInputElement).checked
    ).toBe(false);
  });

  it("does not open the record panel when the arrow's icon is clicked in the database", async () => {
    firstSubs = [{ ...RECORDS[0], id: "r1-sub", parentId: "r1", subCode: "-20", labCode: "SPR.QLAB.20260918.001 (-20)" }];
    vi.stubGlobal("fetch", stubFetch());
    show();
    await row();

    fireEvent.click(screen.getByRole("button", { name: "Show or hide 1 sub-sample" }).querySelector("svg")!);
    expect(screen.getByText("Sub-sample (-20)")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("links a sub-sample to its own page, without ticking the row", async () => {
    firstSubs = [{ ...RECORDS[0], id: "r1-sub", parentId: "r1", subCode: "-20", labCode: "SPR.QLAB.20260918.001 (-20)" }];
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup({ delay: null });
    showAssay();
    await row();
    await user.click(screen.getByRole("button", { name: "Show or hide 1 sub-sample" }));

    const link = screen.getByRole("link", { name: "Sub-sample (-20)" });
    expect(link.getAttribute("href")).toBe("/lab/samples/NKL-2026-00001/sub/-20");
    fireEvent.click(link);
    expect(
      (screen.getByRole("checkbox", { name: "SPR.QLAB.20260918.001 (-20)" }) as HTMLInputElement).checked
    ).toBe(false);
  });

  it("shows no status on a sub-sample, which has none of its own", async () => {
    firstSubs = [{ ...RECORDS[0], id: "r1-sub", parentId: "r1", subCode: "-20", labCode: "SPR.QLAB.20260918.001 (-20)" }];
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup({ delay: null });
    showAssay();
    const parent = await row();
    await user.click(screen.getByRole("button", { name: "Show or hide 1 sub-sample" }));

    const sub = screen.getByRole("link", { name: "Sub-sample (-20)" }).closest("tr") as HTMLElement;
    const pending = en.samples.status.PENDING;
    expect(within(parent).getByText(pending)).toBeTruthy();
    expect(within(parent).getByText(en.samples.notStarted)).toBeTruthy();
    expect(within(sub).queryByText(pending)).toBeNull();
    expect(within(sub).queryByText(en.samples.notStarted)).toBeNull();
  });

  it("folds the sub-samples away again with the same arrow", async () => {
    firstSubs = [{ ...RECORDS[0], id: "r1-sub", parentId: "r1", subCode: "-20", labCode: "SPR.QLAB.20260918.001 (-20)" }];
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup({ delay: null });
    showAssay();
    await row();

    const toggle = screen.getByRole("button", { name: "Show or hide 1 sub-sample" });
    await user.click(toggle);
    expect(screen.getByText("Sub-sample (-20)")).toBeTruthy();
    await user.click(toggle);
    expect(screen.queryByText("Sub-sample (-20)")).toBeNull();
  });

  it("opens the sample whose sub-sample a search found", async () => {
    query = new URLSearchParams({ search: "(-20)" });
    firstSubs = [{ ...RECORDS[0], id: "r1-sub", parentId: "r1", subCode: "-20", labCode: "SPR.QLAB.20260918.001 (-20)" }];
    vi.stubGlobal("fetch", stubFetch());
    showAssay();
    await row();
    expect(screen.getByText("Sub-sample (-20)")).toBeTruthy();
  });

  it("opens a row's result history without ticking the row", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup({ delay: null });
    showAssay();
    await row();

    await user.click(screen.getByRole("button", { name: "History of NKL-2026-00001" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("History · NKL-2026-00001")).toBeTruthy();
    // The dialog hides the page from the accessibility tree while it is open.
    const tick = screen.getByRole("checkbox", { name: "NKL-2026-00001", hidden: true }) as HTMLInputElement;
    expect(tick.checked).toBe(false);
    // And the whole list is a link away.
    expect(
      screen.getByRole("link", { name: en.database.history.open, hidden: true }).getAttribute("href")
    ).toBe("/lab/assay/history");
  });

  it("offers a paste that needs no ticking", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup({ delay: null });
    const { onPaste } = showAssay();
    await row();
    await user.click(screen.getByRole("button", { name: en.database.paste.openAll }));
    expect(onPaste).toHaveBeenCalledWith([]);
  });

  it("ticks a row when the row is clicked, and hands the ticked rows to paste", async () => {
    const user = userEvent.setup({ delay: null });
    const { onPaste } = showAssay();
    const first = await row();

    await user.click(within(first).getByText(/SPR\.QLAB\.20260918\.001/));
    expect((within(first).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    // Nothing opens: on this list a row is picked, not looked at.
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(screen.getByText("1 row(s) selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: en.database.paste.open }));
    expect(onPaste).toHaveBeenCalledWith([expect.objectContaining({ id: "r1" })]);
  });

  it("ticks a whole run with shift+click, and hands it to manual entry", async () => {
    const user = userEvent.setup({ delay: null });
    const { onEnterResults } = showAssay();
    await row();

    const rows = screen.getAllByRole("row").slice(1);
    await user.click(within(rows[0]).getByText(/SPR\.QLAB\.20260918\.001/));
    await user.keyboard("{Shift>}");
    await user.click(within(rows[1]).getByText(/SPR\.QLAB\.20260918\.002/));
    await user.keyboard("{/Shift}");

    expect(screen.getByText("2 row(s) selected")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: en.database.enterManually }));
    expect(onEnterResults.mock.calls[0][0].map((record: { id: string }) => record.id)).toEqual(["r1", "r2"]);
  });
});

/**
 * The sample code names a sample, so it goes to that sample.
 *
 * It was a span in the primary colour on both lists: it looked like a link
 * and was one on neither. Clicking it ticked the row on the entry list and
 * opened the record panel on the database -- never the sample it names, which
 * is the one thing its colour promised.
 */
describe("the sample code", () => {
  it("links to the sample it names", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
        <LabRecordsTable access={FULL} />
      </NextIntlClientProvider>
    );

    const link = within(await row()).getByRole("link", { name: "NKL-2026-00001" });
    expect(link.getAttribute("href")).toBe("/lab/samples/NKL-2026-00001");
  });

  it("escapes a code that would not survive a URL", async () => {
    // Sample codes are generated here today, but a link that breaks on a
    // slash is the kind of thing found much later and from a long way off.
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
        <LabRecordsTable access={FULL} />
      </NextIntlClientProvider>
    );
    await row();

    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("/lab/samples/")) continue;
      expect(href.slice("/lab/samples/".length)).toBe(
        encodeURIComponent(decodeURIComponent(href.slice("/lab/samples/".length)))
      );
    }
  });

  it("does not tick the row it sits in", async () => {
    // The entry list makes the whole row a tick box. The link has to be the
    // hole in that, and isInteractive is what makes it one.
    const user = userEvent.setup({ delay: null });
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
        <LabRecordsTable access={FULL} mode="assay" onPaste={vi.fn()} onEnterResults={vi.fn()} onImport={vi.fn()} />
      </NextIntlClientProvider>
    );
    const first = await row();

    await user.click(within(first).getByRole("link", { name: "NKL-2026-00001" }));

    expect((within(first).getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("does not open the record panel either", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
        <LabRecordsTable access={FULL} />
      </NextIntlClientProvider>
    );
    const first = await row();

    await user.click(within(first).getByRole("link", { name: "NKL-2026-00001" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("arranging the columns", () => {
  /** The movable headings, left to right, by their column key. */
  const headingOrder = () =>
    screen
      .getAllByRole("columnheader")
      .map((th) => th.getAttribute("data-column"))
      .filter((key): key is string => key !== null && key !== "sample");
  const heading = (key: string) =>
    screen.getAllByRole("columnheader").find((th) => th.getAttribute("data-column") === key)!;
  const colWidth = (key: string) =>
    (document.querySelector(`col[data-col="${key}"]`) as HTMLElement | null)?.style.width;

  async function openPicker(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: en.common.columns }));
  }

  it("shows every column with Select all, and goes back to the usual few when unticked", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    await openPicker(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: en.database.layout.selectAll }));
    await waitFor(() => expect(headingOrder()).toHaveLength(2 + ASSAY_FIELDS.length + INSTRUMENT_FIELDS.length));
    expect(
      screen.getByRole("menuitemcheckbox", { name: en.database.layout.selectAll }).getAttribute("aria-checked")
    ).toBe("true");

    await user.click(screen.getByRole("menuitemcheckbox", { name: en.database.layout.selectAll }));
    await waitFor(() => expect(headingOrder()).toEqual(["shiftDate", "status", "ni", "fe", "co", "sio2", "mgo"]));
  });

  it("moves a column by dragging its heading onto another, and remembers it", async () => {
    show();
    await row();
    expect(headingOrder().slice(0, 3)).toEqual(["shiftDate", "status", "ni"]);

    fireEvent.dragStart(heading("ni"));
    fireEvent.dragOver(heading("shiftDate"));
    fireEvent.drop(heading("shiftDate"));
    await waitFor(() => expect(headingOrder().slice(0, 3)).toEqual(["ni", "shiftDate", "status"]));

    // A fresh visit: the in-memory store is gone, localStorage is not.
    cleanup();
    resetTableLayouts();
    show();
    await row();
    expect(headingOrder().slice(0, 3)).toEqual(["ni", "shiftDate", "status"]);
  });

  it("moves a column one place with Alt and the arrow keys", async () => {
    show();
    await row();

    fireEvent.keyDown(heading("shiftDate"), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(headingOrder().slice(0, 2)).toEqual(["status", "shiftDate"]));
  });

  it("resizes a column from its edge, and a double click puts it back", async () => {
    show();
    await row();
    expect(colWidth("ni")).toBe("88px");

    const edge = screen.getByRole("separator", { name: "Resize the Ni % column" });
    fireEvent.keyDown(edge, { key: "ArrowRight" });
    fireEvent.keyDown(edge, { key: "ArrowRight" });
    await waitFor(() => expect(colWidth("ni")).toBe("120px"));
    expect(JSON.parse(window.localStorage.getItem("atara.table-layout.database")!).widths.ni).toBe(120);

    fireEvent.doubleClick(edge);
    await waitFor(() => expect(colWidth("ni")).toBe("88px"));
  });

  it("goes back to the original order and widths with Reset layout", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    fireEvent.keyDown(heading("shiftDate"), { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize the Ni % column" }), { key: "ArrowLeft" });
    await waitFor(() => expect(colWidth("ni")).toBe("72px"));

    await openPicker(user);
    await user.click(await screen.findByRole("menuitem", { name: en.database.layout.reset }));
    await waitFor(() => expect(headingOrder().slice(0, 2)).toEqual(["shiftDate", "status"]));
    expect(colWidth("ni")).toBe("88px");
  });

  it("keeps one cell per heading in every row, whatever the arrangement", async () => {
    show();
    await row();
    fireEvent.dragStart(heading("co"));
    fireEvent.drop(heading("shiftDate"));
    await waitFor(() => expect(headingOrder()[0]).toBe("co"));

    const headings = screen.getAllByRole("row")[0].querySelectorAll("th").length;
    for (const tr of screen.getAllByRole("row").slice(1)) {
      expect(tr.querySelectorAll("td").length).toBe(headings);
    }
  });
});

describe("filling in identities", () => {
  it("leads with Fill in / change identity for the ticked rows, to whoever may edit", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();
    expect(screen.queryByRole("button", { name: /Fill in \/ change identity/ })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "NKL-2026-00002" }));
    const button = screen.getByRole("button", { name: "Fill in / change identity (1)" });
    // The main action of the bar: the primary style, not an outline.
    expect(button.className).toContain("bg-primary");
    // Removal sits apart, on the far side.
    expect(screen.getByRole("button", { name: en.database.remove }).className).toContain("ml-auto");
  });

  it("offers nothing of the kind to a read-only administrator", async () => {
    show(READ_ONLY_ADMIN);
    await row();
    expect(screen.queryByRole("checkbox", { name: "NKL-2026-00002" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Fill in/ })).toBeNull();
  });

  it("offers every record that matches once the whole page is ticked", async () => {
    listTotal = 57;
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    await user.click(screen.getByRole("checkbox", { name: en.database.selectShown }));
    expect(screen.getByText("All 2 on this page are selected.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Select all 57 that match" }));

    await waitFor(() => expect(screen.getByText("57 row(s) selected")).toBeTruthy());
    expect(listCalls.some((url) => url.includes("pageSize=200"))).toBe(true);
    expect(screen.getByText("All 57 records that match are selected.")).toBeTruthy();
  });

  it("stops at the bulk limit when more match", async () => {
    listTotal = 260;
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    await user.click(screen.getByRole("checkbox", { name: en.database.selectShown }));
    await user.click(screen.getByRole("button", { name: "Select the first 200 of 260 that match" }));
    await waitFor(() =>
      expect(screen.getByText("The first 200 of 260 records that match are selected.")).toBeTruthy()
    );
  });

  it("invites filling in every barcode still without a Sample ID, in one go", async () => {
    query = new URLSearchParams({ ident: "missing" });
    listTotal = 30;
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    expect(screen.getByText("30 barcodes have no Sample ID yet.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fill in all 30" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/identity of 30 records/)).toBeTruthy();
  });

  it("forgets the ticks when the filters change", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();
    await user.click(screen.getByRole("checkbox", { name: "NKL-2026-00002" }));
    expect(screen.getByText("1 row(s) selected")).toBeTruthy();

    await user.type(screen.getByLabelText(en.database.searchPlaceholder), "x");
    await waitFor(() => expect(screen.queryByText("1 row(s) selected")).toBeNull(), { timeout: 2000 });
  });

  it("keeps a minimized identity dialog on its own records while the table changes", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();
    await user.click(screen.getByRole("checkbox", { name: "NKL-2026-00002" }));
    await user.click(screen.getByRole("button", { name: "Fill in / change identity (1)" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: en.database.bulkIdentity.minimize }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Filtering clears the ticks; the minimized dialog keeps its record.
    await user.type(screen.getByLabelText(en.database.searchPlaceholder), "x");
    await waitFor(() => expect(screen.queryByText("1 row(s) selected")).toBeNull(), { timeout: 2000 });
    const bar = screen.getByRole("region", { name: en.database.bulkIdentity.minimizedTitle });
    expect(within(bar).getByText(/^1 record/)).toBeTruthy();

    await user.click(within(bar).getByRole("button", { name: en.database.bulkIdentity.restore }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/identity of 1 record/)).toBeTruthy();
  });
});

describe("the Sample column when narrowed", () => {
  it("wraps its codes onto more lines instead of cutting them off", async () => {
    show();
    const first = await row();
    const cell = within(first).getByText("NKL-2026-00001").closest("td") as HTMLElement;

    expect(cell.className).toContain("whitespace-normal");
    expect(cell.querySelector(".truncate")).toBeNull();
    const codes = within(cell).getByText(/SPR\.QLAB\.20260918\.001/);
    expect(codes.textContent).toBe("SPR.QLAB.20260918.001 · MOL/LIM/S2/PA4/B489/1.1/25");
    expect(codes.className).toContain("[overflow-wrap:anywhere]");
  });
});
