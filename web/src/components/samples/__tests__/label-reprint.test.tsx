// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../../../messages/id.json";
import { LabelReprint } from "@/components/samples/label-reprint";
import type { SampleListItemDTO } from "@/types";

const print = vi.fn();
vi.mock("react-to-print", () => ({ useReactToPrint: () => print }));

function sample(index: number): SampleListItemDTO {
  const code = `NKL-2026-${String(index).padStart(5, "0")}`;
  return {
    id: `s${index}`,
    sampleCode: code,
    labCode: null,
    // Even-numbered barcodes have no Sample ID yet: made first, identified later.
    sampleIdent: index % 2 === 0 ? null : `IDENT-${index}`,
    status: "PENDING",
    currentStageId: null,
    currentStage: null,
    createdBy: { id: "u", name: "Admin" },
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

/** 5 samples in total, served 3 per page so there is a second page to load. */
const ALL = Array.from({ length: 5 }, (_, index) => sample(index + 1));
const PER_PAGE = 3;

function stubFetch() {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname === "/api/stages") {
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    }
    const page = Number(url.searchParams.get("page") ?? "1");
    const search = url.searchParams.get("search");
    const ident = url.searchParams.get("ident");
    const matching = (search ? ALL.filter((row) => row.sampleCode.includes(search)) : ALL).filter((row) =>
      ident === "missing" ? row.sampleIdent === null : ident === "has" ? row.sampleIdent !== null : true
    );
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: {
          samples: matching.slice((page - 1) * PER_PAGE, page * PER_PAGE),
          pagination: {
            page,
            pageSize: PER_PAGE,
            total: matching.length,
            totalPages: Math.ceil(matching.length / PER_PAGE),
          },
        },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <NextIntlClientProvider locale="id" messages={messages} timeZone="Asia/Makassar">
      <LabelReprint />
    </NextIntlClientProvider>
  );
}

/** The row's checkbox; the same code may also be on a chip in the panel. */
function box(code: string) {
  const row = screen
    .getAllByText(code)
    .map((element) => element.closest("label"))
    .find((label): label is HTMLLabelElement => label !== null);
  return within(row as HTMLElement).getByRole("checkbox");
}

beforeEach(() => {
  print.mockClear();
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LabelReprint", () => {
  it("keeps the count and Print beside the list as rows are ticked", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("NKL-2026-00001");

    expect(screen.getByRole("button", { name: "Cetak 0 label" })).toHaveProperty("disabled", true);

    await user.click(box("NKL-2026-00001"));
    await user.click(box("NKL-2026-00002"));

    expect(screen.getAllByText("Dipilih (2)").length).toBeGreaterThan(0);
    const printButton = screen.getAllByRole("button", { name: "Cetak 2 label" })[0];
    await user.click(printButton);
    expect(print).toHaveBeenCalled();

    // Each chosen sample can be taken back out on its own.
    await user.click(screen.getByRole("button", { name: "Hapus NKL-2026-00001 dari pilihan" }));
    expect(screen.getAllByText("Dipilih (1)").length).toBeGreaterThan(0);
  });

  it("selects everything shown from the list's own header, and shows a partial one", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("NKL-2026-00001");

    const all = screen.getByRole("checkbox", { name: "Pilih semua yang tampil (3)" }) as HTMLInputElement;
    await user.click(box("NKL-2026-00002"));
    expect(all.indeterminate).toBe(true);

    await user.click(all);
    expect(all.checked).toBe(true);
    expect(screen.getAllByText("Dipilih (3)").length).toBeGreaterThan(0);

    await user.click(all);
    expect(all.checked).toBe(false);
    expect(screen.getAllByText("Dipilih (0)").length).toBeGreaterThan(0);
  });

  it("selects a whole range with shift+click", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("NKL-2026-00001");

    await user.click(box("NKL-2026-00001"));
    await user.keyboard("{Shift>}");
    await user.click(box("NKL-2026-00003"));
    await user.keyboard("{/Shift}");

    expect((box("NKL-2026-00002") as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByText("Dipilih (3)").length).toBeGreaterThan(0);
  });

  it("loads the rest onto the bottom of the list instead of hiding it", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    renderPage();
    await screen.findByText("NKL-2026-00001");
    expect(screen.queryByText("NKL-2026-00004")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Muat lebih banyak (2 lagi)" }));

    expect(await screen.findByText("NKL-2026-00005")).toBeTruthy();
    expect(screen.getByText("NKL-2026-00001")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Muat lebih banyak/ })).toBeNull();
  });

  it("keeps the selection when the search changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("NKL-2026-00001");
    await user.click(box("NKL-2026-00001"));

    await user.type(screen.getByLabelText("Cari kode barcode…"), "00002");
    await waitFor(() => expect(screen.queryByText("NKL-2026-00003")).toBeNull());

    // Still chosen, still listed in the panel, though it is filtered out.
    expect(screen.getAllByText("Dipilih (1)").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Hapus NKL-2026-00001 dari pilihan" })).toBeTruthy();
  });

  it("previews the labels in a dialog instead of on the page", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("NKL-2026-00001");
    await user.click(box("NKL-2026-00001"));

    await user.click(screen.getByRole("button", { name: "Pratinjau" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Pratinjau (1 label)")).toBeTruthy();
    expect(within(dialog).getByText("NKL-2026-00001")).toBeTruthy();
  });
});

describe("whether a barcode has its Sample ID yet", () => {
  it("shows the Sample ID where there is one, and says so where there is not", async () => {
    stubFetch();
    renderPage();
    await screen.findByText("NKL-2026-00001");

    expect(screen.getByText("IDENT-1")).toBeTruthy();
    const second = box("NKL-2026-00002").closest("label") as HTMLElement;
    expect(within(second).getByText(messages.samples.labels.noIdent)).toBeTruthy();
  });

  it("filters to the barcodes still without one", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("NKL-2026-00001");

    await user.click(screen.getByRole("combobox", { name: messages.samples.labels.identLabel }));
    await user.click(await screen.findByRole("option", { name: messages.samples.labels.identMissing }));

    // The list reloads with only the unidentified ones.
    expect(await screen.findByText("NKL-2026-00002")).toBeTruthy();
    expect(screen.getByText("NKL-2026-00004")).toBeTruthy();
    expect(screen.queryByText("NKL-2026-00001")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("ident=missing"))).toBe(true);
  });
});
