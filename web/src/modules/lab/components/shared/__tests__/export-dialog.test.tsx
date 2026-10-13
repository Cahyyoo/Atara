// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { id } from "@/core/i18n/test-messages";
import { ExportDialog } from "@/modules/lab/components/shared/export-dialog";
import { stageColumnKey } from "@/modules/lab/lib/records/export-columns";

const STAGES = [
  { id: "s1", key: null, name: "Preparation", sequenceOrder: 1, description: null },
  { id: "s2", key: null, name: "Analysis", sequenceOrder: 2, description: null },
];

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: STAGES }) }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function show(onExport = vi.fn(), locale: "en" | "id" = "en", onError: (error: unknown) => void = () => {}) {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} onError={onError}>
      <ExportDialog kind="samples" onExport={onExport} />
    </NextIntlClientProvider>
  );
  return onExport;
}

const t = en.exportDialog;

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: en.common.export }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Preparation");
  return within(dialog);
}

describe("ExportDialog", () => {
  it.each(["en", "id"] as const)("renders with every key resolved in %s", async (locale) => {
    const user = userEvent.setup();
    const missing: string[] = [];
    show(vi.fn(), locale, (error) => missing.push(String(error)));
    await user.click(screen.getByRole("button", { name: locale === "en" ? en.common.export : id.common.export }));
    await screen.findByText("Preparation");
    expect(missing).toEqual([]);
  });

  it("starts on the usual columns plus each stage's entry and hours, and sends the choice", async () => {
    const user = userEvent.setup();
    const onExport = show();
    const dialog = await open(user);

    expect((dialog.getByRole("checkbox", { name: "Barcode Code" }) as HTMLInputElement).checked).toBe(true);
    expect((dialog.getByRole("checkbox", { name: `${t.entered} Preparation` }) as HTMLInputElement).checked).toBe(true);
    expect((dialog.getByRole("checkbox", { name: `${t.operator} Preparation` }) as HTMLInputElement).checked).toBe(false);

    // Who scanned each stage, all at once; and no creation details.
    await user.click(dialog.getByRole("checkbox", { name: t.allOf.replace("{part}", t.operator) }));
    await user.click(dialog.getByRole("checkbox", { name: "Created By" }));
    await user.click(dialog.getByRole("button", { name: /Excel/ }));

    await waitFor(() => expect(onExport).toHaveBeenCalled());
    const [format, columns] = onExport.mock.calls[0] as [string, string[]];
    expect(format).toBe("xlsx");
    expect(columns).toContain(stageColumnKey("s2", "by"));
    expect(columns).toContain(stageColumnKey("s1", "duration"));
    expect(columns).not.toContain("createdBy");
    // Sheet order: the sample, its stages, then the rest.
    expect(columns.indexOf("status")).toBeLessThan(columns.indexOf(stageColumnKey("s1", "at")));
    expect(columns.indexOf(stageColumnKey("s2", "by"))).toBeLessThan(columns.indexOf("createdAt"));
  });

  it("clears and fills a whole group, and will not export nothing", async () => {
    const user = userEvent.setup();
    show();
    const dialog = await open(user);

    const sample = dialog.getByText(t.groups.sample).closest("fieldset")!;
    await user.click(within(sample as HTMLElement).getByRole("button", { name: t.none }));
    expect((dialog.getByRole("checkbox", { name: "Lab Code" }) as HTMLInputElement).checked).toBe(false);

    for (const group of ["other"] as const) {
      const fieldset = dialog.getByText(t.groups[group]).closest("fieldset")!;
      await user.click(within(fieldset as HTMLElement).getByRole("button", { name: t.none }));
    }
    for (const part of [t.entered, t.hours]) {
      await user.click(dialog.getByRole("checkbox", { name: t.allOf.replace("{part}", part) }));
    }
    expect(dialog.getByText("0 columns chosen")).toBeTruthy();
    expect((dialog.getByRole("button", { name: /Excel/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("remembers the last choice, and goes back to the default on request", async () => {
    const user = userEvent.setup();
    show();
    let dialog = await open(user);
    await user.click(dialog.getByRole("checkbox", { name: "Created By" }));
    await user.click(dialog.getByRole("button", { name: /CSV/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    dialog = await open(user);
    expect((dialog.getByRole("checkbox", { name: "Created By" }) as HTMLInputElement).checked).toBe(false);
    await user.click(dialog.getByRole("button", { name: t.reset }));
    expect((dialog.getByRole("checkbox", { name: "Created By" }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("choosing which place the file covers", () => {
  const PLACES = [
    { id: "p-mol", kind: "PLACE", code: "MOL", label: null, sortOrder: 0, isActive: true },
    { id: "p-lam", kind: "PLACE", code: "LAM", label: null, sortOrder: 1, isActive: true },
  ];

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).startsWith("/api/master-options")
          ? { ok: true, json: async () => ({ success: true, data: { options: PLACES } }) }
          : { ok: true, json: async () => ({ success: true, data: STAGES }) }
      )
    );
  });

  function showWithPlace(onChange = vi.fn(), value = "ALL") {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ExportDialog kind="labRecords" onExport={vi.fn()} place={{ value, onChange }} />
      </NextIntlClientProvider>
    );
    return onChange;
  }

  it("offers every place, starting on all of them", async () => {
    const user = userEvent.setup();
    showWithPlace();
    const dialog = await open(user);
    const allPlaces = en.masterData.allOf.replace("{kind}", en.masterData.kind.PLACE);
    const chooser = dialog.getByRole("combobox", { name: allPlaces });
    // The chooser sits behind its own label, not the "Place" column tick box.
    expect(chooser.closest("div")?.textContent).toContain(en.exportDialog.place);
    await user.click(chooser);
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      allPlaces,
      "MOL",
      "LAM",
    ]);
  });

  it("reports the place that was picked", async () => {
    const user = userEvent.setup();
    const onChange = showWithPlace();
    const dialog = await open(user);
    const allPlaces = en.masterData.allOf.replace("{kind}", en.masterData.kind.PLACE);
    await user.click(dialog.getByRole("combobox", { name: allPlaces }));
    await user.click(await screen.findByRole("option", { name: "MOL" }));
    expect(onChange).toHaveBeenCalledWith("p-mol");
  });
});
