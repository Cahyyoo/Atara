// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { en } from "@/core/i18n/test-messages";
import { id } from "@/core/i18n/test-messages";
import { LabRecordIdentity } from "@/modules/lab/components/samples/lab-record-identity";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import type { LabRecordListItemDTO } from "@/modules/lab/types";

const CODES = new Map([
  ["place-1", "MOL"],
  ["rock-1", "LIM"],
  ["sir-1", "2"],
  ["pit-1", "A4"],
  ["retired-1", "BG"],
]);

function record(overrides: Partial<LabRecordListItemDTO> = {}): LabRecordListItemDTO {
  return {
    ...Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, null])),
    id: "r1",
    sampleId: "s1",
    labCode: "SPR.QLAB.20260918.004",
    shiftDate: "2026-09-18",
    sequence: 4,
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
    sampleIdent: null,
    remarks: null,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
    sample: {
      id: "s1",
      sampleCode: "NKL-2026-00060",
      status: "PENDING",
      currentStage: null,
    },
    ...overrides,
  } as unknown as LabRecordListItemDTO;
}

function show(value: LabRecordListItemDTO, locale: "en" | "id" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id} onError={() => {}}>
      <LabRecordIdentity record={value} codeById={CODES} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe("LabRecordIdentity", () => {
  it("shows the identity as codes, never as the ids it stores", () => {
    show(
      record({
        placeId: "place-1",
        rockTypeId: "rock-1",
        sirId: "sir-1",
        pitId: "pit-1",
        bargingNo: "B.489",
        sequenceNo: 11,
        sampleNo: 1,
        sackCount: 18,
      })
    );

    expect(screen.getByText("MOL")).toBeTruthy();
    expect(screen.getByText("LIM")).toBeTruthy();
    expect(screen.getByText("A4")).toBeTruthy();
    expect(screen.getByText("B.489")).toBeTruthy();
    // The trap this panel exists to avoid: a cuid on screen tells nobody
    // anything, and it is what the row actually holds.
    expect(document.body.textContent).not.toContain("place-1");
    expect(document.body.textContent).not.toContain("pit-1");
  });

  it("still reads a retired code, which older Sample IDs are full of", () => {
    show(record({ nonProdId: "retired-1" }));
    expect(screen.getByText("BG")).toBeTruthy();
  });

  it("falls back to the id rather than showing nothing for an unknown option", () => {
    show(record({ pitId: "deleted-9" }));
    expect(screen.getByText("deleted-9")).toBeTruthy();
  });

  // Still this component's job: the instrument's own columns sit beside the
  // identity, and the time has to read on the lab's clock rather than as an
  // ISO instant.
  it("shows the measurement time on the lab's clock", () => {
    show(record({ measurementFinished: "2026-09-17T06:03:00.000Z" }));
    expect(screen.getByText("2026-09-17 14:03:00")).toBeTruthy();
  });

  it("shows what the instrument reported alongside the numbers", () => {
    show(record({ measurementMethod: "STARGATE_LG-GEO", solutionId: "878" }));
    expect(screen.getByText("STARGATE_LG-GEO")).toBeTruthy();
    expect(screen.getByText("878")).toBeTruthy();
  });

  it("renders a sample with no identity at all as dashes, not blanks", () => {
    const { container } = show(record());

    expect(container.textContent).not.toContain("undefined");
    expect(container.textContent).not.toContain("null");
    // Nine identity fields plus the instrument's three, all empty.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(12);
  });



  it.each(["en", "id"] as const)("resolves every label in %s", (locale) => {
    const missing: string[] = [];
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "en" ? en : id}
        onError={(error) => missing.push(String(error))}
      >
        <LabRecordIdentity record={record()} codeById={CODES} />
      </NextIntlClientProvider>
    );

    expect(missing).toEqual([]);
  });
});
