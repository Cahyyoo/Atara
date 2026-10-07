// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import id from "../../../../messages/id.json";
import { PasteFromExcel } from "@/components/shared/paste-from-excel";
import { ASSAY_FIELDS } from "@/lib/assay";
import type { LabRecordListItemDTO } from "@/types";

/**
 * The dialog only renders once it is opened, which is how a missing translation
 * key survives a build and a page load. Both locales are rendered here for that
 * reason, and the preview is driven through the real mapper — a stubbed one
 * would prove only that the table renders.
 */

function record(id_: string, sampleIdent: string, ni: number | null): LabRecordListItemDTO {
  const assays = Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, null]));

  return {
    ...assays,
    id: id_,
    sampleId: `s-${id_}`,
    labCode: `SPR.QLAB.20260917.00${id_}`,
    shiftDate: "2026-09-17",
    sequence: Number(id_),
    ni,
    measurementMethod: null,
    solutionId: null,
    measurementFinished: null,
    placeId: null,
    rockTypeId: null,
    nonProdId: null,
    pitId: null,
    sirId: null,
    bargingNo: null,
    sequenceNo: null,
    sampleNo: null,
    sackCount: null,
    sampleIdent,
    remarks: null,
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    sample: {
      id: `s-${id_}`,
      sampleCode: `BC-${id_}`,
        status: "IN_PROGRESS",
      currentStage: null,
    },
  } as unknown as LabRecordListItemDTO;
}

const RECORDS = [
  record("1", "MOL/LIM/S3/PA4/B42/919.1/12", 1.2),
  record("2", "MOL/LIM/S3/PA4/B42/919.2/12", null),
];

function renderDialog(
  locale: "en" | "id",
  onApplied = vi.fn(),
  onError: (error: unknown) => void = () => {},
  extra: { onFill?: (rows: unknown[]) => void; unsupportedFields?: readonly string[] } = {}
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} onError={onError}>
      <PasteFromExcel
        records={RECORDS}
        open
        onClose={vi.fn()}
        onApplied={onApplied}
        {...extra}
      />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PasteFromExcel", () => {
  // next-intl reports an unresolved key to onError and then renders the key
  // path as its own text, so collecting those is what actually proves the
  // translations are there — watching console.error would not.
  it.each(["en", "id"] as const)("renders with every key resolved in %s", async (locale) => {
    const user = userEvent.setup();
    const missing: string[] = [];
    renderDialog(locale, vi.fn(), (error) => missing.push(String(error)));

    // Typing drives out the parts that only exist once a block is pasted: the
    // counters, the match note, the status words and the apply button's count.
    await user.click(screen.getByRole("textbox"));
    await user.paste("Sample ID\tNi\nMOL/LIM/S3/PA4/B42/919.2/12\t2.04\nnot-an-id\t3");

    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(1));
    expect(missing).toEqual([]);
  });

  it("previews what a pasted block would change, before anything is sent", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    renderDialog("en");
    await user.click(screen.getByRole("textbox"));
    await user.paste("Sample ID\tNi\nMOL/LIM/S3/PA4/B42/919.2/12\t2.04");

    await waitFor(() => expect(screen.getByText("1 to update")).toBeTruthy());
    expect(screen.getByText("Matched by Sample ID")).toBeTruthy();
    expect(screen.getByText(/Ni — → 2.04/)).toBeTruthy();
    // The preview is the whole point: nothing may reach the server until Apply.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // The assay grid fills its own inputs instead of saving, so the operator can
  // check the numbers in place before anything moves.
  describe("fill mode", () => {
    it("hands the rows back and never touches the server", async () => {
      const user = userEvent.setup();
      const onFill = vi.fn();
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      renderDialog("en", vi.fn(), () => {}, { onFill });
      await user.click(screen.getByRole("textbox"));
      await user.paste("Sample ID\tNi\nMOL/LIM/S3/PA4/B42/919.2/12\t2.04");

      await waitFor(() => expect(screen.getByText("1 to update")).toBeTruthy());
      await user.click(screen.getByRole("button", { name: /Fill in 1 row/ }));

      expect(onFill).toHaveBeenCalledTimes(1);
      expect(onFill.mock.calls[0][0]).toEqual([
        expect.objectContaining({ targetId: "2", values: { ni: 2.04 } }),
      ]);
      // The whole point of filling rather than applying.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("says plainly that nothing is saved yet", async () => {
      const user = userEvent.setup();
      renderDialog("en", vi.fn(), () => {}, { onFill: vi.fn() });

      await user.click(screen.getByRole("textbox"));
      await user.paste("Sample ID\tNi\nMOL/LIM/S3/PA4/B42/919.2/12\t2.04");

      await waitFor(() => expect(screen.getByText(/filled in below/)).toBeTruthy());
    });

    /**
     * This used to warn that the grid had no field for the instrument's own
     * columns. It has one for all three now, so there is nothing left to
     * refuse — the warning, its prop and its message were removed rather
     * than left behind saying something untrue. That the columns actually
     * arrive is covered where they land, in the entry grid's own tests.
     */
    it("carries the instrument's columns through to the caller", async () => {
      const user = userEvent.setup();
      const onFill = vi.fn();
      renderDialog("en", vi.fn(), () => {}, { onFill });

      await user.click(screen.getByRole("textbox"));
      await user.paste(
        "Sample ID\tNi\tMeasurement Method\nMOL/LIM/S3/PA4/B42/919.2/12\t2.04\tSTARGATE"
      );
      await user.click(await screen.findByRole("button", { name: /^Fill in/ }));

      expect(onFill).toHaveBeenCalledTimes(1);
      const [rows] = onFill.mock.calls[0] as [{ values: Record<string, unknown> }[]];
      expect(rows[0].values.measurementMethod).toBe("STARGATE");
    });

    it("leaves the saving path alone when no fill handler is given", async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { updated: 1 } }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      renderDialog("en");
      await user.click(screen.getByRole("textbox"));
      await user.paste("Sample ID\tNi\nMOL/LIM/S3/PA4/B42/919.2/12\t2.04");

      await waitFor(() => expect(screen.getByText("1 to update")).toBeTruthy());
      await user.click(screen.getByRole("button", { name: /Apply to 1 row/ }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    });
  });

  it("refuses to apply a positional block whose count does not match", async () => {
    const user = userEvent.setup();
    renderDialog("en");

    await user.click(screen.getByRole("textbox"));
    await user.paste("1.86\n1.90\n2.04");

    await waitFor(() => expect(screen.getByText(/3 row\(s\) pasted onto 2 selected/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Apply to/ }).hasAttribute("disabled")).toBe(true);
  });

  it("sends only the rows that change, then reports back", async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { updated: 1 } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    renderDialog("en", onApplied);
    await user.click(screen.getByRole("textbox"));
    // The first row already holds 1.2, so only the second is worth sending.
    await user.paste(
      "Sample ID\tNi\nMOL/LIM/S3/PA4/B42/919.1/12\t1.2\nMOL/LIM/S3/PA4/B42/919.2/12\t2.04"
    );

    await waitFor(() => expect(screen.getByText("1 unchanged")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: /Apply to 1 row/ }));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).records).toEqual([{ id: "2", ni: 2.04 }]);
  });

  describe("without ticking any samples", () => {
    /** The resolve endpoint and the save, stubbed; the bodies sent are kept. */
    function stubServer() {
      const sent: { url: string; body: Record<string, unknown> }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body));
          sent.push({ url, body });
          if (url === "/api/lab-records/resolve") {
            return {
              ok: true,
              json: async () => ({
                success: true,
                data: {
                  results: (body.keys as string[]).map((key) =>
                    key.includes("919.1") && key.includes("(")
                      ? { key, status: "newSub", parent: RECORDS[0], code: "-20" }
                      : key.includes("919.1")
                        ? { key, status: "found", record: RECORDS[0] }
                        : { key, status: "unknown" }
                  ),
                },
              }),
            };
          }
          return { ok: true, json: async () => ({ success: true, data: { updated: 1 } }) };
        })
      );
      return sent;
    }

    function renderFree(locale: "en" | "id" = "en", onApplied = vi.fn(), onError: (error: unknown) => void = () => {}) {
      render(
        <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} onError={onError}>
          <PasteFromExcel records={[]} open onClose={vi.fn()} onApplied={onApplied} />
        </NextIntlClientProvider>
      );
      return onApplied;
    }

    it.each(["en", "id"] as const)("renders with every key resolved in %s", async (locale) => {
      stubServer();
      const user = userEvent.setup();
      const missing: string[] = [];
      renderFree(locale, vi.fn(), (error) => missing.push(String(error)));

      await user.click(screen.getByRole("textbox"));
      await user.paste("Sample ID\tNi\nMOL LIM S3 PA4 B42 919.1 12\t1.35\nMOL LIM S3 PA4 B42 919.1 12 (-20)\t1.4");
      await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(2));
      await user.click(screen.getByRole("button", { name: /^(Apply|Terapkan)/ }));
      await screen.findByRole("alert");
      expect(missing).toEqual([]);
    });

    it("looks the Sample IDs up, spaces or slashes, and makes the new sub-sample", async () => {
      const sent = stubServer();
      const user = userEvent.setup();
      const onApplied = renderFree();

      await user.click(screen.getByRole("textbox"));
      await user.paste("Sample ID\tFe\nMOL LIM S3 PA4 B42 919.1 12\t20\nMOL LIM S3 PA4 B42 919.1 12 (-20)\t22");

      await waitFor(() => expect(screen.getByText("1 new sub-sample")).toBeTruthy());
      expect(sent[0]).toEqual({
        url: "/api/lab-records/resolve",
        body: { keys: ["MOL LIM S3 PA4 B42 919.1 12", "MOL LIM S3 PA4 B42 919.1 12 (-20)"] },
      });
      expect(screen.getByText(en.database.paste.status.create)).toBeTruthy();

      await user.click(screen.getByRole("button", { name: /Apply to 2 row/ }));
      await waitFor(() => expect(onApplied).toHaveBeenCalled());
      expect(sent.at(-1)?.body.records).toEqual([
        { id: "1", fe: 20 },
        { parentId: "1", subCode: "-20", fe: 22 },
      ]);
    });

    it("blocks the whole paste while any Sample ID is not found", async () => {
      stubServer();
      const user = userEvent.setup();
      renderFree();

      await user.click(screen.getByRole("textbox"));
      await user.paste("Sample ID\tFe\nMOL LIM S3 PA4 B42 919.1 12\t20\nNOPE/1\t22");

      await waitFor(() => expect(screen.getByText(en.database.paste.fixUnknown)).toBeTruthy());
      expect((screen.getByRole("button", { name: /Apply to/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("asks for a Sample ID or Lab Code column", async () => {
      stubServer();
      const user = userEvent.setup();
      renderFree();
      await user.click(screen.getByRole("textbox"));
      await user.paste("Ni\tFe\n1.2\t20");
      expect(await screen.findByText(en.database.paste.needKey)).toBeTruthy();
    });
  });

  describe("replacing earlier results", () => {
    it("asks first, then replaces only when told to", async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { updated: 1 } }) });
      vi.stubGlobal("fetch", fetchSpy);
      const onApplied = vi.fn();
      renderDialog("en", onApplied);

      await user.click(screen.getByRole("textbox"));
      // Sample 1 already holds Ni 1.2.
      await user.paste("Sample ID\tNi\tFe\nMOL/LIM/S3/PA4/B42/919.1/12\t1.35\t20");
      await waitFor(() => expect(screen.getByText(/1 row replaces earlier results/)).toBeTruthy());

      await user.click(screen.getByRole("button", { name: /Apply to 1 row/ }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Ni 1.2 → 1.35");
      expect(fetchSpy).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: en.database.paste.overwriteAndSave }));
      await waitFor(() => expect(onApplied).toHaveBeenCalled());
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({
        records: [{ id: "1", ni: 1.35, fe: 20 }],
        overwrite: true,
      });
    });

    it("can save only what was empty, keeping the earlier results", async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { updated: 1 } }) });
      vi.stubGlobal("fetch", fetchSpy);
      renderDialog("en");

      await user.click(screen.getByRole("textbox"));
      await user.paste("Sample ID\tNi\tFe\nMOL/LIM/S3/PA4/B42/919.1/12\t1.35\t20");
      await user.click(await screen.findByRole("button", { name: /Apply to 1 row/ }));
      await user.click(await screen.findByRole("button", { name: en.database.paste.saveWithoutOverwrite }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
      expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({
        records: [{ id: "1", fe: 20 }],
        overwrite: false,
      });
    });
  });
});
