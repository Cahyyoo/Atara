import { describe, expect, it } from "vitest";
import { leadTimeDays, moistureContent, smRatio, weighingProblem } from "@/modules/lab/lib/records/mc";
import { parseWeightsPaste } from "@/modules/lab/lib/records/weights-paste";

/** The figures the Formulir Analysis Result works out, checked against the lab's own sheet. */

describe("moistureContent", () => {
  it("is (W0 - Wd) * 100 / (W0 - Wp), as the form's MC column", () => {
    // Row 11 of the lab's sheet: Wp 579.0, W0 2810.0, Wd 1922.0 -> 39.80.
    expect(moistureContent(579, 2810, 1922)!.toFixed(2)).toBe("39.80");
    expect(moistureContent(564.5, 3131.5, 2276)!.toFixed(2)).toBe("33.33");
  });

  it("waits for all three weights, and never divides by nothing", () => {
    expect(moistureContent(579, 2810, null)).toBeNull();
    expect(moistureContent(null, 2810, 1922)).toBeNull();
    expect(moistureContent(500, 500, 500)).toBeNull();
  });
});

describe("smRatio", () => {
  it("is SiO2 over MgO", () => {
    expect(smRatio(33.02, 8.37)!.toFixed(2)).toBe("3.95");
  });

  it("is empty without MgO", () => {
    expect(smRatio(33.02, 0)).toBeNull();
    expect(smRatio(33.02, null)).toBeNull();
    expect(smRatio(null, 8.37)).toBeNull();
  });
});

describe("leadTimeDays", () => {
  const wita = (day: number, hour: number) => new Date(Date.UTC(2025, 11, day, hour - 8));

  it("counts calendar days on the lab's clock from wet preparation to the report", () => {
    expect(leadTimeDays(wita(17, 9), wita(19, 8))).toBe(2);
    expect(leadTimeDays(wita(18, 23), wita(19, 1))).toBe(1);
    expect(leadTimeDays(wita(19, 7), wita(19, 15))).toBe(0);
  });

  it("is empty until both have happened", () => {
    expect(leadTimeDays(wita(17, 9), null)).toBeNull();
    expect(leadTimeDays(undefined, wita(19, 9))).toBeNull();
  });
});

describe("weighingProblem", () => {
  it("accepts a sensible weighing, and one still being filled in", () => {
    expect(weighingProblem(579, 2810, 1922)).toBeNull();
    expect(weighingProblem(579, null, null)).toBeNull();
  });

  it("refuses a wet sample no heavier than its pan, or a dry one outside the two", () => {
    expect(weighingProblem(600, 600, 600)).toMatch(/W0/);
    expect(weighingProblem(579, 2810, 2900)).toMatch(/Wd/);
    expect(weighingProblem(579, 2810, 500)).toMatch(/Wd/);
  });
});

describe("parseWeightsPaste", () => {
  it("reads Sample ID, Wp, W0, Wd in that order without a header", () => {
    const { rows, hasHeader } = parseWeightsPaste("MOL/SAP/A4/PA11/B78/779.1\t564.5\t3131.5\t2276\n");
    expect(hasHeader).toBe(false);
    expect(rows).toEqual([{ line: 1, key: "MOL/SAP/A4/PA11/B78/779.1", values: { wp: 564.5, w0: 3131.5, wd: 2276 } }]);
  });

  it("finds the columns by their header, in any order, and reads a decimal comma", () => {
    const { rows, hasHeader } = parseWeightsPaste("Wd\tSample ID\tW0\tWp\n2276,0\tA/1\t3.131,5\t564,5\n");
    expect(hasHeader).toBe(true);
    expect(rows[0]).toEqual({ line: 2, key: "A/1", values: { wp: 564.5, w0: 3131.5, wd: 2276 } });
  });

  it("reads a line typed with spaces: the numbers at the end, the Sample ID before them", () => {
    const { rows, hasHeader } = parseWeightsPaste("MOL SAP A4/PITA11/B78/779.3 583.5 3073.5 2124.0");
    expect(hasHeader).toBe(false);
    expect(rows).toEqual([
      { line: 1, key: "MOL SAP A4/PITA11/B78/779.3", values: { wp: 583.5, w0: 3073.5, wd: 2124 } },
    ]);
  });

  it("keeps a sack count written with a space in the Sample ID, and reads a decimal comma", () => {
    const { rows } = parseWeightsPaste("LAM SAM S2 PA4 B10 3778.1 25  583,5 3073,5 2124\n");
    expect(rows[0]).toEqual({ line: 1, key: "LAM SAM S2 PA4 B10 3778.1 25", values: { wp: 583.5, w0: 3073.5, wd: 2124 } });
  });

  it("finds a header typed with spaces", () => {
    const { rows, hasHeader } = parseWeightsPaste("Sample ID Wd W0 Wp\nA/1 2124 3073.5 583.5");
    expect(hasHeader).toBe(true);
    expect(rows[0]).toEqual({ line: 2, key: "A/1", values: { wp: 583.5, w0: 3073.5, wd: 2124 } });
  });

  it("asks for all three weights on a line typed with spaces", () => {
    expect(parseWeightsPaste("A/1 583.5 3073.5").rows[0].error).toMatch(/Wp, W0 and Wd/);
  });

  it("leaves a blank weight out, and names a cell it cannot read", () => {
    const { rows } = parseWeightsPaste("A/1\t564.5\t\t2276\nA/2\tabc\t3000\t2000\n\n");
    expect(rows[0].values).toEqual({ wp: 564.5, wd: 2276 });
    expect(rows[1].error).toMatch(/WP "abc"/);
    expect(rows).toHaveLength(2);
  });
});
