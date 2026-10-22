import { describe, expect, it } from "vitest";
import { byControl, chartValue, duplicatePairs, oneToOne, standardPoints } from "@/modules/eksplorasi/lib/qc-chart";

describe("a value on a chart", () => {
  it("is a number however the lab wrote it, or nothing", () => {
    expect(chartValue("1.25")).toBe(1.25);
    expect(chartValue("1,25")).toBe(1.25);
    expect(chartValue("<0.01")).toBeNull();
    expect(chartValue("")).toBeNull();
    expect(chartValue(null)).toBeNull();
  });
});

describe("the standard (CRM) chart", () => {
  it("puts each standard at its date, and leaves out what has nowhere to go", () => {
    const { points, skipped } = standardPoints([
      { sampleId: "S1", control: "OREAS-1", date: "2026-10-01", value: "1.5" },
      { sampleId: "S2", control: " OREAS-2 ", date: "2026-10-02", value: "2,5" },
      { sampleId: "S3", control: "OREAS-1", date: null, value: "1.5" },
      { sampleId: "S4", control: null, date: "2026-10-03", value: "1.5" },
      { sampleId: "S5", control: "OREAS-1", date: "2026-10-03", value: "<0.01" },
    ]);
    expect(points).toEqual([
      { sampleId: "S1", control: "OREAS-1", x: Date.UTC(2026, 9, 1), y: 1.5 },
      { sampleId: "S2", control: "OREAS-2", x: Date.UTC(2026, 9, 2), y: 2.5 },
    ]);
    expect(skipped).toBe(3);
  });

  it("groups the points by CRM, in a stable order", () => {
    const point = (control: string, y: number) => ({ sampleId: `${control}${y}`, control, x: 0, y });
    const groups = byControl([point("B", 1), point("A", 2), point("B", 3)]);
    expect(groups.map((group) => [group.control, group.points.map((p) => p.y)])).toEqual([
      ["A", [2]],
      ["B", [1, 3]],
    ]);
  });
});

describe("the duplicate chart", () => {
  const originals = new Map([
    ["s-1", { sampleId: "S-1", value: "1.50" }],
    ["s-2", { sampleId: "S-2", value: "n/a" }],
  ]);

  it("puts each duplicate against the sample its control names, case aside", () => {
    const { pairs, unmatched, skipped } = duplicatePairs(
      [
        { sampleId: "D-1", control: " s-1 ", value: "1.55" },
        { sampleId: "D-2", control: "S-2", value: "1.2" },
        { sampleId: "D-3", control: "S-404", value: "1.2" },
        { sampleId: "D-4", control: null, value: "1.2" },
        { sampleId: "D-5", control: "S-1", value: "<0.01" },
      ],
      originals
    );
    expect(pairs).toEqual([{ sampleId: "D-1", originalId: "S-1", x: 1.5, y: 1.55 }]);
    expect(unmatched).toBe(2);
    expect(skipped).toBe(2);
  });

  it("draws the 1:1 line across every value on either axis", () => {
    expect(oneToOne([])).toBeNull();
    expect(
      oneToOne([
        { sampleId: "a", originalId: "b", x: 2, y: 0.5 },
        { sampleId: "c", originalId: "d", x: 1, y: 3 },
      ])
    ).toEqual([0.5, 3]);
  });
});
