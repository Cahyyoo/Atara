import { describe, expect, it } from "vitest";
import {
  composeIdentity,
  emptyIdentity,
  identityPayload,
  nextIdentity,
  type IdentityValues,
} from "@/modules/lab/components/database/sample-identity-fields";
import type { MasterOptionDTO } from "@/modules/lab/types";

function option(id: string, kind: MasterOptionDTO["kind"], code: string): MasterOptionDTO {
  return { id, kind, code, label: null, sortOrder: 0, isActive: true } as MasterOptionDTO;
}

const OPTIONS = [
  option("p1", "PLACE", "MOL"),
  option("r1", "ROCK_TYPE", "LIM"),
  option("s1", "SIR", "3"),
  option("t1", "PIT", "A4"),
  option("n1", "NON_PROD", "TP"),
];

const FULL: IdentityValues = {
  ...emptyIdentity(),
  placeId: "p1",
  rockTypeId: "r1",
  sirId: "s1",
  pitId: "t1",
  bargingNo: "B.42",
  sequenceNo: "919",
  sampleNo: "1",
  sackCount: "25",
};

describe("nextIdentity", () => {
  it("advances the sample number and copies everything else", () => {
    const next = nextIdentity(FULL);

    expect(next.sampleNo).toBe("2");
    expect({ ...next, sampleNo: "" }).toEqual({ ...FULL, sampleNo: "" });
  });

  it("advances by the requested step, so adding ten gives ten consecutive numbers", () => {
    expect([1, 2, 3].map((step) => nextIdentity(FULL, step).sampleNo)).toEqual(["2", "3", "4"]);
  });

  /**
   * The rule the old running-number code was careful about, kept: inventing a 1
   * would put a Sample ID on a barcode nobody has identified yet.
   */
  it("leaves a blank sample number blank rather than inventing one", () => {
    expect(nextIdentity({ ...FULL, sampleNo: "" }).sampleNo).toBe("");
    expect(nextIdentity(emptyIdentity()).sampleNo).toBe("");
  });
});

describe("composeIdentity", () => {
  it("resolves the option ids to codes and composes the id", () => {
    expect(composeIdentity(FULL, OPTIONS)).toBe("MOL LIM S3/PA4/B42/919.1/25");
  });

  it("includes the non-production code when one is chosen", () => {
    expect(composeIdentity({ ...FULL, nonProdId: "n1" }, OPTIONS)).toBe(
      "MOL LIM TP S3/PA4/B42/919.1/25"
    );
  });

  it("leaves out a part the preparator has not filled in", () => {
    expect(composeIdentity({ ...FULL, sackCount: "" }, OPTIONS)).toBe(
      "MOL LIM S3/PA4/B42/919.1"
    );
  });

  it("composes from the place alone", () => {
    expect(composeIdentity({ ...emptyIdentity(), placeId: "p1" }, OPTIONS)).toBe("MOL");
  });

  it("composes nothing without a place", () => {
    expect(composeIdentity({ ...FULL, placeId: "NONE" }, OPTIONS)).toBeNull();
    expect(composeIdentity(emptyIdentity(), OPTIONS)).toBeNull();
  });

  // The options arrive over the network, so the first render has none of them:
  // the place id is held, but its code is not known yet.
  it("composes nothing before the master list has loaded", () => {
    expect(composeIdentity(FULL, [])).toBeNull();
  });
});

describe("identityPayload", () => {
  it("sends nulls rather than the sentinel the pickers hold", () => {
    expect(identityPayload(emptyIdentity())).toEqual({
      placeId: null,
      rockTypeId: null,
      nonProdId: null,
      pitId: null,
      sirId: null,
      bargingNo: null,
      sequenceNo: null,
      sampleNo: null,
      sackCount: null,
    });
  });

  it("sends the numbers as numbers", () => {
    const payload = identityPayload(FULL);
    expect(payload).toMatchObject({ placeId: "p1", sequenceNo: 919, sampleNo: 1, sackCount: 25 });
  });
});
