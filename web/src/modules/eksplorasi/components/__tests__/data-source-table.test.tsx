// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { resetPersistedColumns } from "@/core/hooks/use-persisted-columns";
import { resetTableLayouts } from "@/core/hooks/use-table-layout";
import { DataSourceTable } from "@/modules/eksplorasi/components/data-source-table";
import { ARRANGEABLE, defaultColumns } from "@/modules/eksplorasi/components/list-columns";
import { ELEMENT_FIELDS, ELEMENT_LABELS } from "@/modules/eksplorasi/lib/data-source-columns";
import type { DataSourceDTO, DataSourceView } from "@/modules/eksplorasi/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/eksplorasi/data-source",
  useSearchParams: () => new URLSearchParams(),
}));

const ROW: DataSourceDTO = {
  id: "d1",
  controlDate: null,
  control: null,
  campaign: "CAMP-A",
  no: null,
  holeId: "DH-001",
  sampleId: "S-001",
  sampleType: "ORIGINAL",
  from: "0.0",
  to: "1.0",
  remarks: null,
  date: "2026-10-01",
  weight: "2.3",
  ...(Object.fromEntries(ELEMENT_FIELDS.map((field) => [field, null])) as Record<(typeof ELEMENT_FIELDS)[number], null>),
  ni: "1.52",
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

/** The page the list's answer says it is on. */
let listPage = 1;

beforeEach(() => {
  listPage = 1;
  window.localStorage.clear();
  resetPersistedColumns();
  resetTableLayouts();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/data-sources/campaigns")) {
        return { ok: true, json: async () => ({ success: true, data: ["CAMP-A"] }) };
      }
      if (String(url).includes("/api/data-sources")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { rows: [ROW], pagination: { page: listPage, pageSize: 25, total: 26, totalPages: 2 } },
          }),
        };
      }
      throw new Error(`unexpected request: ${url}`);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(view: DataSourceView = "dataSource") {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar" onError={() => {}}>
      <DataSourceTable view={view} />
    </NextIntlClientProvider>
  );
}

/** Waits for the one data row, not for the header that is there from the start. */
async function row() {
  await waitFor(() => screen.getByText("S-001"));
  return screen.getAllByRole("row")[1];
}

/** The movable headings, left to right, by their column key. */
const headingOrder = () =>
  screen
    .getAllByRole("columnheader")
    .map((th) => th.getAttribute("data-column"))
    .filter((key): key is string => key !== null);
const heading = (key: string) => screen.getAllByRole("columnheader").find((th) => th.getAttribute("data-column") === key)!;
/** The cells of the data row, as text. */
const cells = async () => [...(await row()).querySelectorAll("td")].map((td) => td.textContent);

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: en.common.columns }));
}

describe("a sample's detail", () => {
  it("opens from the row with every field and all sixteen assay results", async () => {
    show();
    fireEvent.click(await row());
    const panel = await screen.findByRole("dialog", { name: "S-001" });
    expect(panel.textContent).toContain(en.dataSource.detail.results);
    expect(panel.textContent).toContain("DH-001");
    expect(panel.textContent).toContain("1.52");
    for (const element of ELEMENT_FIELDS) expect(panel.textContent).toContain(ELEMENT_LABELS[element]);
  });

  it("opens with Enter, but not from the row's own buttons", async () => {
    show();
    const tr = await row();
    fireEvent.click(screen.getByRole("button", { name: en.dataSource.editRow.replace("{sampleId}", "S-001") }));
    expect(screen.queryByRole("dialog", { name: "S-001" })).toBeNull();
    fireEvent.keyDown(tr, { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "S-001" })).toBeTruthy();
  });

  it("hands Delete over to the delete dialog", async () => {
    show();
    fireEvent.click(await row());
    const panel = await screen.findByRole("dialog", { name: "S-001" });
    fireEvent.click(within(panel).getByRole("button", { name: en.dataSource.delete.action }));
    expect(await screen.findByText(en.dataSource.delete.title)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "S-001" })).toBeNull());
  });
});

describe("the row number", () => {
  it("comes first, stays put, and counts on from the pages before", async () => {
    listPage = 2;
    show();
    await row();
    const first = screen.getAllByRole("columnheader")[0];
    expect(first.textContent).toBe(en.dataSource.fields.rowNo);
    expect(first.getAttribute("draggable")).toBeNull();
    expect((await cells())[0]).toBe("26");
  });
});

describe("arranging a list's columns", () => {
  it("shows the list's columns in their usual order, with no edge to resize", async () => {
    show();
    await row();
    expect(headingOrder()).toEqual(defaultColumns("dataSource").filter((column) => column !== "rowNo" && column !== "actions"));
    for (const element of ELEMENT_FIELDS) expect(headingOrder()).not.toContain(element);
    expect(screen.queryByRole("separator")).toBeNull();
    // The usual columns read at the comfortable size.
    expect(screen.getByRole("table").className).toContain("text-[13px]");
    const widths = [...document.querySelectorAll("col")].reduce((sum, col) => sum + parseFloat(col.style.width), 0);
    expect(widths).toBeCloseTo(100, 1);
  });

  it("moves a column by dragging its heading onto another, cells and all, and remembers it", async () => {
    show();
    await row();
    expect(headingOrder().slice(0, 3)).toEqual(["campaign", "holeId", "sampleId"]);

    fireEvent.dragStart(heading("sampleId"));
    fireEvent.dragOver(heading("campaign"));
    fireEvent.drop(heading("campaign"));
    await waitFor(() => expect(headingOrder().slice(0, 3)).toEqual(["sampleId", "campaign", "holeId"]));
    expect((await cells()).slice(0, 4)).toEqual(["1", "S-001", "CAMP-A", "DH-001"]);

    // A fresh visit: the in-memory store is gone, localStorage is not.
    cleanup();
    resetTableLayouts();
    show();
    await row();
    expect(headingOrder().slice(0, 3)).toEqual(["sampleId", "campaign", "holeId"]);
  });

  it("moves a column one place with Alt and the arrow keys", async () => {
    show();
    await row();
    fireEvent.keyDown(heading("campaign"), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(headingOrder().slice(0, 2)).toEqual(["holeId", "campaign"]));
  });

  it("hides a column from the Columns menu, gives its room to the others, and remembers it", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();

    await openMenu(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: en.dataSource.fields.holeId }));
    await waitFor(() => expect(headingOrder()).not.toContain("holeId"));
    expect(await cells()).not.toContain("DH-001");
    expect((await row()).querySelectorAll("td").length).toBe(screen.getAllByRole("columnheader").length);
    const widths = [...document.querySelectorAll("col")].reduce((sum, col) => sum + parseFloat(col.style.width), 0);
    expect(widths).toBeCloseTo(100, 1);
    expect(JSON.parse(window.localStorage.getItem("atara.columns.eksplorasi.v3.dataSource")!)).not.toContain("holeId");

    // The sample ID cannot be hidden: a row without it cannot be told apart.
    expect(screen.getByRole("menuitemcheckbox", { name: en.dataSource.fields.sampleId }).getAttribute("aria-disabled")).toBe("true");

    // Another list keeps its own choice.
    cleanup();
    show("standard");
    await row();
    expect(headingOrder()).toContain("holeId");
  });

  it("goes back to the usual columns and order with Reset layout", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();
    fireEvent.keyDown(heading("campaign"), { key: "ArrowRight", altKey: true });
    await openMenu(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: en.dataSource.fields.weight }));
    await waitFor(() => expect(headingOrder()).not.toContain("weight"));

    await user.click(screen.getByRole("menuitem", { name: en.dataSource.layout.reset }));
    await waitFor(() => expect(headingOrder()).toEqual(defaultColumns("dataSource").filter((column) => column !== "rowNo" && column !== "actions")));
  });

  it("shows an assay result when ticked, every column (tightened) with Show all, and hides them again on Reset layout", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();
    await openMenu(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Ni" }));
    await waitFor(() => expect(headingOrder()).toContain("ni"));
    expect(headingOrder()).not.toContain("fe");
    expect(await cells()).toContain("1.52");

    await user.click(screen.getByRole("menuitemcheckbox", { name: en.dataSource.layout.showAll }));
    await waitFor(() => expect(headingOrder()).toEqual(ARRANGEABLE.dataSource));
    expect(screen.getByRole("table").className).toContain("text-[11px]");

    await user.click(screen.getByRole("menuitem", { name: en.dataSource.layout.reset }));
    await waitFor(() => expect(headingOrder()).not.toContain("ni"));
  });
});
