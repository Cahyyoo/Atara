import { describe, expect, it } from "vitest";
import type { LabRecord } from "@prisma/client";
import { diffLabRecord } from "@/lib/lab-record";

/**
 * Prisma hands back Decimal objects, but toLabRecordDTO only ever calls
 * Number() on them, so plain numbers stand in faithfully here.
 */
function makeRecord(overrides: Partial<Record<string, unknown>> = {}): LabRecord {
  return {
    id: "rec1",
    sampleId: "sample1",
    labCode: "LAM_QLAB_20260908_0001",
    shiftDate: new Date("2026-09-08T00:00:00.000Z"),
    sequence: 1,
    ni: 1.5,
    fe: 20,
    co: null,
    sio2: null,
    mgo: null,
    cao: null,
    al2o3: null,
    cr: null,
    fe2o3: null,
    cr2o3: null,
    mno: null,
    na2o: null,
    p2o5: null,
    tio2: null,
    s: null,
    co2: null,
    zn: null,
    sum: null,
    measurementMethod: null,
    solutionId: null,
    measurementFinished: null,
    remarks: null,
    updatedById: null,
    createdAt: new Date("2026-09-08T01:00:00.000Z"),
    updatedAt: new Date("2026-09-08T02:00:00.000Z"),
    ...overrides,
  } as unknown as LabRecord;
}

describe("diffLabRecord", () => {
  it("reports nothing when the values are unchanged", () => {
    expect(diffLabRecord(makeRecord(), { ni: 1.5, fe: 20 })).toEqual({});
  });

  it("reports only the columns that actually moved", () => {
    const changes = diffLabRecord(makeRecord(), { ni: 1.75, fe: 20 });
    expect(changes).toEqual({ ni: { from: 1.5, to: 1.75 } });
  });

  it("records filling in an empty column", () => {
    const changes = diffLabRecord(makeRecord(), { co: 0.08 });
    expect(changes).toEqual({ co: { from: null, to: 0.08 } });
  });

  it("records clearing a column", () => {
    const changes = diffLabRecord(makeRecord(), { ni: null });
    expect(changes).toEqual({ ni: { from: 1.5, to: null } });
  });

  it("treats zero and null as different values", () => {
    expect(diffLabRecord(makeRecord({ ni: 0 }), { ni: null })).toEqual({
      ni: { from: 0, to: null },
    });
    expect(diffLabRecord(makeRecord({ ni: null }), { ni: 0 })).toEqual({
      ni: { from: null, to: 0 },
    });
    expect(diffLabRecord(makeRecord({ ni: 0 }), { ni: 0 })).toEqual({});
  });

  it("ignores fields the caller did not send at all", () => {
    const changes = diffLabRecord(makeRecord(), { ni: undefined, fe: undefined });
    expect(changes).toEqual({});
  });

  it("tracks remarks alongside the numbers", () => {
    const changes = diffLabRecord(makeRecord({ remarks: "old note" }), {
      remarks: "new note",
      ni: 1.5,
    });
    expect(changes).toEqual({ remarks: { from: "old note", to: "new note" } });
  });

  it("collects several changes in one pass", () => {
    const changes = diffLabRecord(makeRecord(), { ni: 2, fe: 21, co: 0.1 });
    expect(Object.keys(changes).sort()).toEqual(["co", "fe", "ni"]);
  });
});
