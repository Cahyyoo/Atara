import { describe, expect, it } from "vitest";
import { blankOverview, duplicateOverview, standardOverview } from "@/modules/eksplorasi/lib/qc-overview";
import type { QcBlank, QcControl, QcDuplicate, StandardSummaryRow } from "@/modules/eksplorasi/types";

/** The dashboard's summary cards, worked out from what the tables hold. */

const row = (standard: string, n: number, within2: number | null, within3: number | null = 1): StandardSummaryRow => ({
  standard,
  certified: within2 === null ? null : 1,
  sd: within2 === null ? null : 0.1,
  n,
  mean: n > 0 ? 1 : null,
  min: n > 0 ? 1 : null,
  max: n > 0 ? 1 : null,
  within1: within2,
  within2,
  within3: within2 === null ? null : within3,
  outside2: within2 === null ? null : 1 - within2,
  remarks: null,
});

describe("the standards' summary", () => {
  it("counts the standard samples once, and weighs the share within 2 SD by assays", () => {
    const summary: QcControl["summary"] = [
      { element: "ni", rows: [row("A", 10, 1), row("B", 10, 0.8, 0.9)] },
      { element: "co", rows: [row("A", 10, 1), row("B", 10, null), row("C", 0, null)] },
    ];
    const overview = standardOverview(summary);
    expect(overview.assays).toBe(20);
    // (10 + 8 + 10) of the 30 assays judged.
    expect(overview.within2).toBeCloseTo(28 / 30);
    expect(overview.outside3).toBe(1);
    expect(overview).toMatchObject({ flagged: 1, attention: 1 });
  });

  it("has no share to give without a certified value or an assay", () => {
    expect(standardOverview([])).toEqual({ assays: 0, within2: null, outside3: 0, flagged: 0, attention: 0 });
    expect(standardOverview([{ element: "ni", rows: [row("A", 5, null)] }]).within2).toBeNull();
  });
});

describe("the blanks' summary", () => {
  const points = (...values: number[]) => values.map((y, index) => ({ sampleId: `B${index}`, x: index + 1, y, belowDetection: false }));

  it("counts the readings past the Preferred Value, and names their elements", () => {
    const elements: QcBlank["elements"] = [
      { element: "ni", limit: 0.01, points: points(0.005, 0.02, 0.03), skipped: 0 },
      { element: "co", limit: 0.01, points: points(0.004, 0.01), skipped: 0 },
      { element: "cr2o3", limit: null, points: points(0.9), skipped: 0 },
    ];
    const overview = blankOverview(elements);
    expect(overview).toMatchObject({ blanks: 3, anomalies: 2, elementsWithAnomaly: ["ni"], attention: 2 });
    // Two of the five readings judged; Cr2O3 has no line to judge against.
    expect(overview.anomalyShare).toBeCloseTo(2 / 5);
  });

  it("has nothing to count without blanks", () => {
    expect(blankOverview([])).toEqual({ blanks: 0, anomalies: 0, anomalyShare: null, elementsWithAnomaly: [], attention: 0 });
  });
});

describe("the duplicates' summary", () => {
  const pair = (id: string, x: number, y: number) => ({ sampleId: id, originalId: `${id}-O`, x, y });

  it("gives the share within 10% RPD, the mean RPD, and the weakest fit", () => {
    const elements: QcDuplicate["elements"] = [
      { element: "ni", pairs: [pair("D1", 1, 1), pair("D2", 2, 2.1), pair("D3", 3, 3.9)], skipped: 1 },
      { element: "co", pairs: [pair("D1", 0.1, 0.1), pair("D2", 0.2, 0.2)], skipped: 0 },
    ];
    const overview = duplicateOverview(elements);
    expect(overview.pairs).toBe(4);
    // D3's Ni (3 against 3.9) is 26% apart: past 10%, and past 20%.
    expect(overview.withinRpd).toBeCloseTo(4 / 5);
    expect(overview).toMatchObject({ flagged: 1, attention: 1 });
    expect(overview.lowestR2?.element).toBe("ni");
    expect(overview.lowestR2!.r2).toBeLessThan(1);
  });

  it("has no fit with fewer than two pairs, and no share with none", () => {
    expect(duplicateOverview([{ element: "ni", pairs: [pair("D1", 1, 1)], skipped: 0 }]).lowestR2).toBeNull();
    expect(duplicateOverview([])).toMatchObject({ pairs: 0, withinRpd: null, averageRpd: null, lowestR2: null, attention: 0 });
  });
});
