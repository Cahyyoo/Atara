// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { resetPersistedColumns } from "@/core/hooks/use-persisted-columns";
import { resetTableLayouts } from "@/core/hooks/use-table-layout";
import { DataSourceTable } from "@/modules/eksplorasi/components/data-source-table";
import { ARRANGEABLE, defaultColumns } from "@/modules/eksplorasi/components/list-columns";
import { ELEMENT_FIELDS } from "@/modules/eksplorasi/lib/data-source-columns";
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

beforeEach(() => {
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
            data: { rows: [ROW], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } },
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

describe("arranging a list's columns", () => {
  it("shows the list's columns in their usual order, with no edge to resize", async () => {
    show();
    await row();
    expect(headingOrder()).toEqual(defaultColumns("dataSource").filter((column) => column !== "actions"));
    expect(headingOrder()).not.toContain("na2o");
    expect(screen.queryByRole("separator")).toBeNull();
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
    expect((await cells()).slice(0, 3)).toEqual(["S-001", "CAMP-A", "DH-001"]);

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
    expect(JSON.parse(window.localStorage.getItem("atara.columns.eksplorasi.v2.dataSource")!)).not.toContain("holeId");

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
    await waitFor(() => expect(headingOrder()).toEqual(defaultColumns("dataSource").filter((column) => column !== "actions")));
  });

  it("shows a hidden oxide when ticked, every column with Show all, and hides them again on Reset layout", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    await row();
    await openMenu(user);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Na2O" }));
    await waitFor(() => expect(headingOrder()).toContain("na2o"));
    expect(headingOrder()).not.toContain("mgo");

    await user.click(screen.getByRole("menuitemcheckbox", { name: en.dataSource.layout.showAll }));
    await waitFor(() => expect(headingOrder()).toEqual(ARRANGEABLE.dataSource));

    await user.click(screen.getByRole("menuitem", { name: en.dataSource.layout.reset }));
    await waitFor(() => expect(headingOrder()).not.toContain("na2o"));
  });
});
