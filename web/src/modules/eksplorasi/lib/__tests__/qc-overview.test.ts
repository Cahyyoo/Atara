import { describe, expect, it } from "vitest";
import { blankAttention, duplicateAttention, standardAttention } from "@/modules/eksplorasi/lib/qc-overview";
import type { QcBlank, QcControl, QcDuplicate, StandardSummaryRow } from "@/modules/eksplorasi/types";

/** What the dashboard's tabs count on their labels, worked out from what the tables hold. */

const row = (standard: string, outside2: number | null): StandardSummaryRow => ({
  standard,
  certified: outside2 === null ? null : 1,
  sd: outside2 === null ? null : 0.1,
  n: 10,
  mean: 1,
  min: 1,
  max: 1,
  within1: outside2 === null ? null : 1 - outside2,
  within2: outside2 === null ? null : 1 - outside2,
  within3: outside2 === null ? null : 1,
  outside2,
  remarks: null,
});

describe("the Standard tab's count", () => {
  it("is the standard × element rows with more than 5% past 2 SD, 5% itself a pass", () => {
    const summary: QcControl["summary"] = [
      { element: "ni", rows: [row("A", 0), row("B", 0.2), row("C", 0.05)] },
      { element: "co", rows: [row("A", 0.1), row("B", null)] },
    ];
    expect(standardAttention(summary)).toBe(2);
    expect(standardAttention([])).toBe(0);
  });
});

describe("the Blank tab's count", () => {
  const points = (...values: number[]) => values.map((y, index) => ({ sampleId: `B${index}`, x: index + 1, y, belowDetection: false }));

  it("is the readings past the Preferred Value, over the elements with one", () => {
    const elements: QcBlank["elements"] = [
      { element: "ni", limit: 0.01, points: points(0.005, 0.02, 0.03), skipped: 0 },
      { element: "co", limit: 0.01, points: points(0.004, 0.01), skipped: 0 },
      { element: "cr2o3", limit: null, points: points(0.9), skipped: 0 },
    ];
    expect(blankAttention(elements)).toBe(2);
    expect(blankAttention([])).toBe(0);
  });
});

describe("the Duplicate tab's count", () => {
  const pair = (id: string, x: number, y: number) => ({ sampleId: id, originalId: `${id}-O`, x, y });

  it("is the pairs at 20% RPD or more", () => {
    const elements: QcDuplicate["elements"] = [
      // 3 against 3.9 is 26% apart; 2 against 2.1 under 5%.
      { element: "ni", pairs: [pair("D1", 1, 1), pair("D2", 2, 2.1), pair("D3", 3, 3.9)], skipped: 1 },
      { element: "co", pairs: [pair("D1", 0.1, 0.13)], skipped: 0 },
    ];
    expect(duplicateAttention(elements)).toBe(2);
    expect(duplicateAttention([])).toBe(0);
  });
});
