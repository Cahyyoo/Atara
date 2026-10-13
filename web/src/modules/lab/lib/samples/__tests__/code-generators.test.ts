import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { allocateLabCodes } from "@/modules/lab/lib/samples/lab-code";
import { generateSampleCode, generateSampleCodes } from "@/modules/lab/lib/samples/sample-code";

const SHIFT_DATE = new Date("2026-09-08T00:00:00.000Z");

/** Stands in for the Prisma client: only findFirst is ever reached. */
function fakeLabDb(last: { sequence: number } | null) {
  return {
    labRecord: { findFirst: async () => last },
  } as unknown as Prisma.TransactionClient;
}

/**
 * Stands in for the samples table, answering the generator's MAX query the way
 * MySQL would: the codes under the asked-for prefix, their number part read as
 * an unsigned integer (text that is not a number reads as 0).
 *
 * It honours the prefix on purpose: the generator asks once per prefix, and a
 * fake that answered the same row to every question would report the same test
 * as passing whether or not the two prefixes were kept apart.
 */
function fakeSampleDb(stored: { sampleCode: string } | { sampleCode: string }[] | null) {
  const rows = stored === null ? [] : Array.isArray(stored) ? stored : [stored];

  return {
    $queryRaw: async (_sql: TemplateStringsArray, from: number, like: string) => {
      const head = like.replace(/%$/, "");
      const numbers = rows
        .filter((row) => row.sampleCode.startsWith(head))
        .map((row) => {
          const digits = /^\d+/.exec(row.sampleCode.slice(from - 1));
          return digits ? Number(digits[0]) : 0;
        });
      return [{ last: numbers.length ? Math.max(...numbers) : null }];
    },
  } as unknown as Prisma.TransactionClient;
}

describe("allocateLabCodes", () => {
  it("starts at 001 on an empty shift day", async () => {
    const codes = await allocateLabCodes(fakeLabDb(null), 3, SHIFT_DATE);
    expect(codes.map((code) => code.labCode)).toEqual([
      "SPR.QLAB.20260908.001",
      "SPR.QLAB.20260908.002",
      "SPR.QLAB.20260908.003",
    ]);
    expect(codes.map((code) => code.sequence)).toEqual([1, 2, 3]);
  });

  it("continues from the last sequence already issued that day", async () => {
    const codes = await allocateLabCodes(fakeLabDb({ sequence: 7 }), 2, SHIFT_DATE);
    expect(codes.map((code) => code.labCode)).toEqual([
      "SPR.QLAB.20260908.008",
      "SPR.QLAB.20260908.009",
    ]);
  });

  it("shares one run of numbers whatever the sample's place", async () => {
    // The old format kept a separate run per LAM/MOL because the code carried
    // that prefix. SPR does not, so the day has a single sequence and the
    // allocator no longer takes a code type at all.
    const codes = await allocateLabCodes(fakeLabDb({ sequence: 4 }), 1, SHIFT_DATE);
    expect(codes[0].labCode).toBe("SPR.QLAB.20260908.005");
  });

  it("takes the date segment from the shift day, not from today", async () => {
    const codes = await allocateLabCodes(fakeLabDb(null), 1, new Date("2025-12-31T00:00:00.000Z"));
    expect(codes[0].labCode).toBe("SPR.QLAB.20251231.001");
  });

  it("pads to three digits but does not truncate beyond them", async () => {
    const codes = await allocateLabCodes(fakeLabDb({ sequence: 998 }), 3, SHIFT_DATE);
    expect(codes.map((code) => code.labCode)).toEqual([
      "SPR.QLAB.20260908.999",
      "SPR.QLAB.20260908.1000",
      "SPR.QLAB.20260908.1001",
    ]);
  });

  it("returns nothing when asked for nothing", async () => {
    expect(await allocateLabCodes(fakeLabDb(null), 0, SHIFT_DATE)).toEqual([]);
  });
});

describe("generateSampleCodes", () => {
  it("starts at 00001 for a fresh year", async () => {
    const codes = await generateSampleCodes(2, 2026, fakeSampleDb(null));
    expect(codes).toEqual(["SMPL-2026-00001", "SMPL-2026-00002"]);
  });

  it("continues from the highest existing code", async () => {
    const codes = await generateSampleCodes(3, 2026, fakeSampleDb({ sampleCode: "SMPL-2026-00042" }));
    expect(codes).toEqual(["SMPL-2026-00043", "SMPL-2026-00044", "SMPL-2026-00045"]);
  });

  /**
   * The labels already stuck to containers say NKL, so those codes stay. The
   * numbering must not restart around them: issuing SMPL-2026-00001 while
   * NKL-2026-00001 is on a bucket would make "sample 1" name two things.
   */
  it("carries on past the codes issued under the old prefix", async () => {
    const codes = await generateSampleCodes(2, 2026, fakeSampleDb({ sampleCode: "NKL-2026-00081" }));
    expect(codes).toEqual(["SMPL-2026-00082", "SMPL-2026-00083"]);
  });

  it("takes the higher of the two prefixes, whichever is ahead", async () => {
    const codes = await generateSampleCodes(
      1,
      2026,
      fakeSampleDb([{ sampleCode: "NKL-2026-00081" }, { sampleCode: "SMPL-2026-00090" }])
    );
    expect(codes).toEqual(["SMPL-2026-00091"]);
  });

  it("ignores codes from another year, under either prefix", async () => {
    const codes = await generateSampleCodes(
      1,
      2027,
      fakeSampleDb([{ sampleCode: "NKL-2026-00081" }, { sampleCode: "SMPL-2026-00090" }])
    );
    expect(codes).toEqual(["SMPL-2027-00001"]);
  });

  it("carries the requested year into the code", async () => {
    const codes = await generateSampleCodes(1, 2027, fakeSampleDb(null));
    expect(codes[0]).toBe("SMPL-2027-00001");
  });

  it("falls back to the first code when the stored one is unparseable", async () => {
    const codes = await generateSampleCodes(1, 2026, fakeSampleDb({ sampleCode: "SMPL-2026-oops" }));
    expect(codes[0]).toBe("SMPL-2026-00001");
  });

  it("keeps five-digit padding past ten thousand", async () => {
    const codes = await generateSampleCodes(1, 2026, fakeSampleDb({ sampleCode: "SMPL-2026-09999" }));
    expect(codes[0]).toBe("SMPL-2026-10000");
  });

  it("keeps counting past 99,999 in a year", async () => {
    // As text, "SMPL-2026-100000" sorts below "SMPL-2026-99999": a generator
    // that took the last code by text order offered 100000 again for ever.
    const codes = await generateSampleCodes(
      2,
      2026,
      fakeSampleDb([{ sampleCode: "SMPL-2026-99999" }, { sampleCode: "SMPL-2026-100000" }])
    );
    expect(codes).toEqual(["SMPL-2026-100001", "SMPL-2026-100002"]);
  });
});

describe("generateSampleCode", () => {
  it("issues a single code in the same format", async () => {
    expect(await generateSampleCode(2026, fakeSampleDb(null))).toBe("SMPL-2026-00001");
    expect(await generateSampleCode(2026, fakeSampleDb({ sampleCode: "SMPL-2026-00009" }))).toBe(
      "SMPL-2026-00010"
    );
  });
});
