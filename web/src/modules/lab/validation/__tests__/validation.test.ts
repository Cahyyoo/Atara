import { describe, expect, it } from "vitest";
import { deleteSamplesSchema, generateSamplesSchema, listSamplesQuerySchema, myScanHistoryQuerySchema, scanSampleSchema } from "@/modules/lab/validation/samples";
import { updateLabRecordSchema } from "@/modules/lab/validation/records";

describe("updateLabRecordSchema", () => {
  it("accepts a percentage inside range", () => {
    expect(updateLabRecordSchema.parse({ ni: 1.845 }).ni).toBe(1.845);
  });

  it("rejects a percentage above 100", () => {
    expect(updateLabRecordSchema.safeParse({ ni: 150 }).success).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(updateLabRecordSchema.safeParse({ fe: -1 }).success).toBe(false);
  });

  it("keeps null as null instead of coercing it to zero", () => {
    // The whole "blank clears the cell" behaviour rests on this.
    const parsed = updateLabRecordSchema.parse({ ni: null });
    expect(parsed.ni).toBeNull();
    expect(parsed.ni).not.toBe(0);
  });

  it("coerces the numeric strings a form sends", () => {
    expect(updateLabRecordSchema.parse({ ni: "2.5" }).ni).toBe(2.5);
  });

  it("rejects text that is not a number", () => {
    expect(updateLabRecordSchema.safeParse({ ni: "not-a-number" }).success).toBe(false);
  });

  it("lets Sum past 100, since it is the instrument's own total", () => {
    // Stored as reported rather than recomputed, so an odd run must not be
    // rejected on the way in.
    expect(updateLabRecordSchema.parse({ sum: 101.4 }).sum).toBe(101.4);
  });

  it("still holds the elements to a percentage", () => {
    expect(updateLabRecordSchema.safeParse({ zn: 101 }).success).toBe(false);
    expect(updateLabRecordSchema.safeParse({ cr2o3: 100 }).success).toBe(true);
  });

  it("accepts the descriptive columns the instrument reports", () => {
    const parsed = updateLabRecordSchema.parse({
      measurementMethod: "STARGATE_LG-GEO",
      solutionId: "878",
      measurementFinished: "2026-09-15T09:43:00.000Z",
    });
    expect(parsed.measurementMethod).toBe("STARGATE_LG-GEO");
    expect(parsed.solutionId).toBe("878");
    expect(parsed.measurementFinished).toBeInstanceOf(Date);
  });

  it("omits fields the caller left out", () => {
    expect(Object.keys(updateLabRecordSchema.parse({ ni: 1 }))).toEqual(["ni"]);
  });

  it("caps remarks length", () => {
    expect(updateLabRecordSchema.safeParse({ remarks: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("scanSampleSchema", () => {
  const base = { sample_code: "NKL-2026-00001", stage_id: "s1" };

  it("no longer requires operator_id, which the server ignores", () => {
    expect(scanSampleSchema.safeParse(base).success).toBe(true);
  });

  it("still accepts operator_id from older mobile builds", () => {
    expect(scanSampleSchema.safeParse({ ...base, operator_id: "u1" }).success).toBe(true);
  });

  it("requires a meaningful override reason", () => {
    expect(scanSampleSchema.safeParse({ ...base, force: true, reason: "typo" }).success).toBe(false);
    expect(
      scanSampleSchema.safeParse({ ...base, force: true, reason: "Wrong stage scanned." }).success
    ).toBe(true);
  });

  it("requires a sample code and a stage", () => {
    expect(scanSampleSchema.safeParse({ stage_id: "s1" }).success).toBe(false);
    expect(scanSampleSchema.safeParse({ sample_code: "X" }).success).toBe(false);
  });
});

describe("generateSamplesSchema", () => {
  const identity = { placeId: "place-1" };
  const list = (...identities: object[]) => ({ identities });

  it("accepts one identity per barcode", () => {
    const parsed = generateSamplesSchema.parse(list(identity, identity, identity));
    expect(parsed.identities).toHaveLength(3);
  });

  // A barcode sometimes has to be printed before the barging run is known, so
  // the whole identity is optional and that sample is identified later.
  it("accepts an entry with no identity at all", () => {
    expect(generateSamplesSchema.safeParse(list({})).success).toBe(true);
  });

  it("carries each identity through separately", () => {
    const parsed = generateSamplesSchema.parse(
      list(
        { ...identity, bargingNo: "B.42", sequenceNo: 919, sampleNo: 1, sackCount: 25 },
        { ...identity, bargingNo: "B.43", sequenceNo: 920, sampleNo: 7, sackCount: 30 }
      )
    );

    expect(parsed.identities[0].sampleNo).toBe(1);
    expect(parsed.identities[1].sampleNo).toBe(7);
    expect(parsed.identities[1].bargingNo).toBe("B.43");
  });

  /**
   * The shape the form used to send. Accepting it as well would parse to an
   * empty list, or worse to a single sample, for an operator who asked for
   * fifty — so it has to be refused outright.
   */
  it("refuses the old quantity-times-one-identity request", () => {
    expect(generateSamplesSchema.safeParse({ quantity: 50, ...identity }).success).toBe(false);
  });

  it("refuses a request that would create nothing", () => {
    expect(generateSamplesSchema.safeParse({ identities: [] }).success).toBe(false);
  });

  // Any master option id will do here; an unknown one is caught by the foreign
  // key, not by a list of codes baked into the schema.
  it("rejects a blank option id rather than storing whitespace", () => {
    expect(generateSamplesSchema.safeParse(list({ placeId: "   " })).success).toBe(false);
  });

  it("bounds the sample number", () => {
    expect(generateSamplesSchema.safeParse(list({ sampleNo: -1 })).success).toBe(false);
    expect(generateSamplesSchema.safeParse(list({ sampleNo: 1000000 })).success).toBe(false);
  });

  it("bounds how many barcodes one request may create", () => {
    const many = (count: number) => ({ identities: Array.from({ length: count }, () => identity) });

    expect(generateSamplesSchema.safeParse(many(501)).success).toBe(false);
    expect(generateSamplesSchema.safeParse(many(500)).success).toBe(true);
  });
});

describe("listSamplesQuerySchema", () => {
  it("applies sensible defaults", () => {
    const query = listSamplesQuerySchema.parse({});
    expect(query).toMatchObject({ page: 1, pageSize: 20, sort: "updatedAt", order: "desc" });
  });

  it("refuses a sort column that is not on the allow list", () => {
    expect(listSamplesQuerySchema.safeParse({ sort: "password" }).success).toBe(false);
  });

  it("caps the page size", () => {
    expect(listSamplesQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });
});

describe("deleteSamplesSchema", () => {
  it("takes the ids and defaults to deleting rather than restoring", () => {
    const parsed = deleteSamplesSchema.parse({ ids: ["a", "b"] });
    expect(parsed.ids).toEqual(["a", "b"]);
    // The safer reading of a missing flag is the one that can be undone, and
    // both directions can — but deleting is what the button says.
    expect(parsed.restore).toBe(false);
  });

  it("carries the restore flag when it is given", () => {
    expect(deleteSamplesSchema.parse({ ids: ["a"], restore: true }).restore).toBe(true);
  });

  it("refuses a request that would touch nothing", () => {
    expect(deleteSamplesSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(deleteSamplesSchema.safeParse({}).success).toBe(false);
  });

  it("refuses a blank id rather than sending whitespace to the database", () => {
    expect(deleteSamplesSchema.safeParse({ ids: ["   "] }).success).toBe(false);
  });

  it("bounds how many can go at once", () => {
    const many = (count: number) => ({ ids: Array.from({ length: count }, (_, i) => `id-${i}`) });
    expect(deleteSamplesSchema.safeParse(many(501)).success).toBe(false);
    expect(deleteSamplesSchema.safeParse(many(500)).success).toBe(true);
  });
});

describe("myScanHistoryQuerySchema", () => {
  it("defaults to exactly what the endpoint did before it took parameters", () => {
    // Load-bearing, not decorative. Phones already in the field call
    // /samples/scan/mine with no query string, and these three defaults are
    // the only thing keeping that call behaving as it always has. In
    // particular pageSize must stay 100 -- it was MAX_LOGS -- and must not be
    // "tidied" to 20 to match listSamplesQuerySchema.
    expect(myScanHistoryQuerySchema.parse({})).toEqual({
      days: 1,
      page: 1,
      pageSize: 100,
    });
  });

  it("coerces the strings a query string actually delivers", () => {
    expect(
      myScanHistoryQuerySchema.parse({ days: "14", page: "2", pageSize: "50" })
    ).toEqual({ days: 14, page: 2, pageSize: 50 });
  });

  it("refuses a window with no ceiling", () => {
    expect(myScanHistoryQuerySchema.safeParse({ days: 90 }).success).toBe(true);
    expect(myScanHistoryQuerySchema.safeParse({ days: 91 }).success).toBe(false);
    expect(myScanHistoryQuerySchema.safeParse({ days: 0 }).success).toBe(false);
  });

  it("allows a page size of 100, or the default would reject itself", () => {
    expect(myScanHistoryQuerySchema.safeParse({ pageSize: 100 }).success).toBe(true);
    expect(myScanHistoryQuerySchema.safeParse({ pageSize: 200 }).success).toBe(true);
    expect(myScanHistoryQuerySchema.safeParse({ pageSize: 201 }).success).toBe(false);
    expect(myScanHistoryQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
