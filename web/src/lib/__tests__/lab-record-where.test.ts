import { describe, expect, it } from "vitest";
import { buildLabRecordWhere } from "@/lib/lab-record";
import { listLabRecordsQuerySchema } from "@/lib/validation";

describe("filtering lab records", () => {
  it("takes a range of shift days, both ends included", () => {
    const where = buildLabRecordWhere({ from: "2026-09-18", to: "2026-09-25" });
    expect(where.shiftDate).toEqual({
      gte: new Date(Date.UTC(2026, 8, 18)),
      lte: new Date(Date.UTC(2026, 8, 25)),
    });
  });

  it("leaves either end of the range open", () => {
    expect(buildLabRecordWhere({ from: "2026-09-18" }).shiftDate).toEqual({
      gte: new Date(Date.UTC(2026, 8, 18)),
    });
    expect(buildLabRecordWhere({ to: "2026-09-18" }).shiftDate).toEqual({
      lte: new Date(Date.UTC(2026, 8, 18)),
    });
  });

  it("still honours a single shift day, ahead of a range", () => {
    const where = buildLabRecordWhere({ shiftDate: "2026-09-18", from: "2026-09-01" });
    expect(where.shiftDate).toEqual(new Date(Date.UTC(2026, 8, 18)));
  });

  it("judges 'has a result' by Ni alone, on the sample or one of its sub-samples", () => {
    expect(buildLabRecordWhere({ results: "missing" }).AND).toContainEqual({
      OR: [{ ni: null }, { subs: { some: { ni: null } } }],
    });
    expect(buildLabRecordWhere({ results: "present" }).AND).toContainEqual({
      OR: [{ ni: { not: null } }, { subs: { some: { ni: { not: null } } } }],
    });
    expect(buildLabRecordWhere({}).AND).toBeUndefined();
  });

  it("lists samples, each bringing its sub-samples along", () => {
    expect(buildLabRecordWhere({}).parentId).toBeNull();
  });

  it("accepts only the two result filters and real dates", () => {
    expect(() => listLabRecordsQuerySchema.parse({ results: "partial" })).toThrow();
    expect(() => listLabRecordsQuerySchema.parse({ from: "18/09/2026" })).toThrow();
    expect(listLabRecordsQuerySchema.parse({ counts: "true" }).counts).toBe(true);
    expect(listLabRecordsQuerySchema.parse({}).counts).toBe(false);
  });
});
