// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { LabRecordDialog } from "@/modules/lab/components/database/lab-record-dialog";
import { PasteWeightsDialog } from "@/modules/lab/components/database/paste-weights";
import type { LabRecordListItemDTO, WeightsPasteResult } from "@/modules/lab/types";

vi.mock("@/core/components/ui/toast", () => ({ toast: vi.fn() }));

/** The moisture-content weighing: the Tabel MC in the record dialog, and the paste. */

const RECORD = {
  id: "r1",
  labCode: "SPR.QLAB.1",
  sampleIdent: "MOL/B78/779.1",
  parentId: null,
  placeId: null,
  rockTypeId: null,
  nonProdId: null,
  pitId: null,
  sirId: null,
  bargingNo: null,
  sequenceNo: null,
  sampleNo: null,
  sackCount: null,
  measurementMethod: null,
  solutionId: null,
  measurementFinished: null,
  xrayInstrument: null,
  remarks: null,
  wp: 579,
  w0: 2810,
  wd: null,
  ni: null, fe: null, co: null, sio2: null, mgo: null, cao: null, al2o3: null, cr: null, fe2o3: null,
  cr2o3: null, mno: null, na2o: null, p2o5: null, tio2: null, s: null, co2: null, zn: null, sum: null,
  sample: { id: "s1", sampleCode: "NKL-1", status: "PENDING", currentStage: null },
} as unknown as LabRecordListItemDTO;

let sent: { url: string; body: Record<string, unknown> }[] = [];
let pasteAnswer: WeightsPasteResult | null = null;

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.body) sent.push({ url, body: JSON.parse(String(init.body)) });
      const data = url.startsWith("/api/master-options")
        ? []
        : url === "/api/lab-records/weights"
          ? pasteAnswer
          : { ...RECORD, ...(sent.at(-1)?.body ?? {}) };
      return { ok: true, json: async () => ({ success: true, data }) };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Makassar">
      {children}
    </NextIntlClientProvider>
  );
}

describe("the Tabel MC in the record dialog", () => {
  it("works MC out as the weights are typed, and sends them", async () => {
    const user = userEvent.setup({ delay: null });
    render(wrap(<LabRecordDialog record={RECORD} onClose={() => {}} onSaved={() => {}} />));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(en.database.mcSection)).toBeTruthy();
    expect(within(dialog).getByText("—", { selector: "span.font-semibold" })).toBeTruthy();

    await user.type(within(dialog).getByLabelText(en.database.wd), "1922");
    expect(within(dialog).getByText("39.80")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: en.database.dialog.save }));
    expect(sent.at(-1)?.body).toMatchObject({ wp: 579, w0: 2810, wd: 1922 });
  });

  it("says so, and will not save, when the dried sample is heavier than the wet one", async () => {
    const user = userEvent.setup({ delay: null });
    render(wrap(<LabRecordDialog record={RECORD} onClose={() => {}} onSaved={() => {}} />));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(en.database.wd), "3000");
    expect(within(dialog).getByText(en.database.mcInvalid)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: en.database.dialog.save }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("pasting Wp, W0 and Wd", () => {
  beforeEach(() => {
    pasteAnswer = {
      rows: [
        {
          line: 1,
          key: "MOL/B78/779.1",
          status: "update",
          record: { id: "r1", labCode: "L1", sampleIdent: "MOL/B78/779.1", sampleCode: "NKL-1" },
          from: { wp: null, w0: null, wd: null },
          to: { wp: 579, w0: 2810, wd: 1922 },
          mc: 39.8028,
        },
        { line: 2, key: "MOL/B78/999.1", status: "unknown" },
      ],
      summary: { total: 2, update: 1, unchanged: 0, unknown: 1, invalid: 0 },
      saved: 1,
    };
  });

  it("checks the block first, shows what changes, then saves it", async () => {
    const user = userEvent.setup({ delay: null });
    const onSaved = vi.fn();
    render(wrap(<PasteWeightsDialog open onClose={() => {}} onSaved={onSaved} />));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText(en.database.weights.label));
    await user.paste("MOL/B78/779.1\t579\t2810\t1922\nMOL/B78/999.1\t1\t2\t1.5");
    await user.click(within(dialog).getByRole("button", { name: en.database.weights.check }));

    expect(sent.at(-1)).toEqual({
      url: "/api/lab-records/weights",
      body: {
        dryRun: true,
        rows: [
          { line: 1, key: "MOL/B78/779.1", wp: 579, w0: 2810, wd: 1922 },
          { line: 2, key: "MOL/B78/999.1", wp: 1, w0: 2, wd: 1.5 },
        ],
      },
    });
    expect(await within(dialog).findByText("39.80")).toBeTruthy();
    expect(within(dialog).getByText(en.database.weights.statuses.unknown)).toBeTruthy();
    expect(within(dialog).getByText(en.database.weights.notFoundHint)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Save 1 row" }));
    expect(sent.at(-1)?.body).toMatchObject({ dryRun: false });
    expect(onSaved).toHaveBeenCalled();
  });

  it("names a row it cannot read instead of sending it", async () => {
    const user = userEvent.setup({ delay: null });
    render(wrap(<PasteWeightsDialog open onClose={() => {}} onSaved={() => {}} />));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByLabelText(en.database.weights.label));
    await user.paste("MOL/B78/779.1\tabc\t2810\t1922");
    await user.click(within(dialog).getByRole("button", { name: en.database.weights.check }));

    expect(within(dialog).getByRole("alert").textContent).toMatch(/Row 1: WP "abc"/);
    expect(sent).toHaveLength(0);
  });
});
