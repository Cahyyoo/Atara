// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { LabRecordFilters, type LabRecordFilterValues } from "@/modules/lab/components/shared/lab-record-filters";
import { getShiftDate, toShiftDateInputValue } from "@/modules/lab/lib/stages/shift-date";

const EMPTY: LabRecordFilterValues = { search: "", placeId: "ALL", from: "", to: "", results: "all" };

function show(values: Partial<LabRecordFilterValues> = {}, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} onError={() => {}}>
      <LabRecordFilters values={{ ...EMPTY, ...values }} onChange={onChange} showResults />
    </NextIntlClientProvider>
  );
  return onChange;
}

const day = (back: number) =>
  toShiftDateInputValue(new Date(getShiftDate().getTime() - back * 24 * 60 * 60 * 1000));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { options: [] } }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LabRecordFilters", () => {
  it("names a preset range after a reload", () => {
    show({ from: day(6), to: day(0) });
    expect(screen.getByRole("combobox", { name: en.database.filters.dateLabel }).textContent).toContain(
      en.database.filters.date7
    );
  });

  it("shows the two date boxes only for a range that is no preset", () => {
    show({ from: "2026-09-01", to: "2026-09-10" });
    expect(screen.getByLabelText(en.database.filters.dateFrom)).toBeTruthy();
    cleanup();
    show();
    expect(screen.queryByLabelText(en.database.filters.dateFrom)).toBeNull();
  });

  it("asks for the results filter by name", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = show();
    await user.click(screen.getByRole("button", { name: en.database.filters.resultsMissing }));
    expect(onChange).toHaveBeenCalledWith({ results: "missing" });
  });

  it("offers a reset only once something is filtered, and clears everything", async () => {
    const user = userEvent.setup({ delay: null });
    show();
    expect(screen.queryByRole("button", { name: en.database.filters.reset })).toBeNull();
    cleanup();

    const onChange = show({ placeId: "p1", from: "2026-09-01" });
    await user.click(screen.getByRole("button", { name: en.database.filters.reset }));
    expect(onChange).toHaveBeenCalledWith({ search: null, placeId: null, from: null, to: null, results: null, ident: null });
  });
});
