import { describe, expect, it } from "vitest";
import {
  chartValue,
  controlLimits,
  controlPoints,
  crmKey,
  sdFieldOf,
  valueRange,
  zScore,
} from "@/modules/eksplorasi/lib/qc-control";

/** The control charts' arithmetic, without a database. */

describe("a value on a chart", () => {
  it("is a number however the lab wrote it, or nothing", () => {
    expect(chartValue("1.25")).toBe(1.25);
    expect(chartValue("1,25")).toBe(1.25);
    expect(chartValue("<0.01")).toBeNull();
    expect(chartValue("")).toBeNull();
    expect(chartValue(null)).toBeNull();
  });
});

describe("a standard's name in both lists", () => {
  it("is the same however each list writes it", () => {
    expect(crmKey("OREAS-184")).toBe("oreas184");
    expect(crmKey("Oreas184")).toBe("oreas184");
    expect(crmKey(" oreas 184 ")).toBe("oreas184");
    expect(crmKey("OREAS-184")).not.toBe(crmKey("OREAS-187"));
  });

  it("finds an element's SD column in the CRM List", () => {
    expect(sdFieldOf("ni")).toBe("sdNi");
    expect(sdFieldOf("fe2o3")).toBe("sdFe2o3");
  });
});

describe("the control lines", () => {
  it("are the certified value ±1, 2 and 3 SDs", () => {
    const limits = controlLimits("1.48", "0.015")!;
    expect(limits.certified).toBe(1.48);
    expect(limits.plus1).toBeCloseTo(1.495);
    expect(limits.minus2).toBeCloseTo(1.45);
    expect(limits.plus3).toBeCloseTo(1.525);
    expect(limits.minus3).toBeCloseTo(1.435);
  });

  it("are not drawn without a usable value and SD", () => {
    expect(controlLimits(null, "0.01")).toBeNull();
    expect(controlLimits("1.48", null)).toBeNull();
    expect(controlLimits("1.48", "")).toBeNull();
    expect(controlLimits("1.48", "0")).toBeNull();
    expect(controlLimits("n/a", "0.01")).toBeNull();
  });

  it("place a reading in SDs from the certified value", () => {
    const limits = controlLimits("1.00", "0.10")!;
    expect(zScore(1.18, limits)).toBeCloseTo(1.8);
    expect(zScore(0.7, limits)).toBeCloseTo(-3);
  });
});

describe("the readings", () => {
  it("are drawn at their sample index; a value that is not a number is counted, not drawn", () => {
    const { points, skipped } = controlPoints([
      { sampleId: "S1", index: 13, date: "2026-09-01", value: "1.29" },
      { sampleId: "S2", index: 30, date: null, value: "<0.01" },
      { sampleId: "S3", index: 48, date: "2026-09-03", value: null },
      { sampleId: "S4", index: 61, date: null, value: "1.27" },
    ]);
    expect(points).toEqual([
      { sampleId: "S1", date: "2026-09-01", x: 13, y: 1.29 },
      { sampleId: "S4", date: null, x: 61, y: 1.27 },
    ]);
    expect(skipped).toBe(2);
  });

  it("fit on the value axis together with ±3σ", () => {
    const limits = controlLimits("1.00", "0.10")!;
    const range = valueRange([{ sampleId: "S", date: null, x: 1, y: 1.6 }], limits)!;
    expect(range.min).toBeLessThan(0.7);
    expect(range.max).toBeGreaterThan(1.6);
    expect(valueRange([], null)).toBeNull();
  });
});
