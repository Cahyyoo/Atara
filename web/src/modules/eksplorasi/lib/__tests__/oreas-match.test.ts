import { describe, expect, it } from "vitest";
import { matchOreas, oreasNames, type OreasStandard } from "@/modules/eksplorasi/lib/oreas-match";

/** Which OREAS a row's assay is: the one rule the sheet and the server share. */

const OREAS184_XRF: OreasStandard = { standard: "Oreas184", ni: "1.02", co: "0.09", fe2o3: "39.30", al2o3: "4.62", cr2o3: "1.75" };
const OREAS184_ICP: OreasStandard = { standard: "Oreas184", ni: "1.02", co: "0.09", fe2o3: "39.42", al2o3: "4.58", cr2o3: "1.75" };
const OREAS189: OreasStandard = { standard: "Oreas189", ni: "1.48", co: "0.03", fe2o3: "15.04", al2o3: "2.09", cr2o3: "7.65" };
const STANDARDS = [OREAS184_XRF, OREAS184_ICP, OREAS189];

const row = (values: Partial<Record<"ni" | "co" | "fe2o3" | "al2o3" | "cr2o3", string | null>>) => ({
  ni: "1.02",
  co: "0.09",
  fe2o3: "39.30",
  al2o3: "4.62",
  cr2o3: "1.75",
  ...values,
});

describe("matching a row to an OREAS standard", () => {
  it("names the standard whose five values the row's are", () => {
    expect(matchOreas(row({}), STANDARDS)).toBe("Oreas184");
    expect(matchOreas({ ni: "1.48", co: "0.03", fe2o3: "15.04", al2o3: "2.09", cr2o3: "7.65" }, STANDARDS)).toBe("Oreas189");
  });

  it("compares numbers, not text: 0.71 is 0.710", () => {
    expect(matchOreas(row({ ni: "1.020", fe2o3: "39.3" }), STANDARDS)).toBe("Oreas184");
  });

  it("does not match a value that is only close", () => {
    expect(matchOreas(row({ ni: "1.021" }), STANDARDS)).toBeNull();
  });

  it("needs all five, as numbers", () => {
    expect(matchOreas(row({ cr2o3: null }), STANDARDS)).toBeNull();
    expect(matchOreas(row({ co: "<0.01" }), STANDARDS)).toBeNull();
    // A CRM row missing a value can never match.
    expect(matchOreas(row({}), [{ ...OREAS184_XRF, al2o3: null }])).toBeNull();
  });

  it("counts one name under two test methods once", () => {
    expect(matchOreas(row({}), [OREAS184_XRF, { ...OREAS184_XRF }])).toBe("Oreas184");
  });

  it("guesses nothing when two different standards match", () => {
    expect(matchOreas(row({}), [OREAS184_XRF, { ...OREAS184_XRF, standard: "OreasCopy" }])).toBeNull();
  });

  it("offers each name once, in order, for the dropdown", () => {
    expect(oreasNames([OREAS189, OREAS184_XRF, OREAS184_ICP])).toEqual(["Oreas184", "Oreas189"]);
  });
});
