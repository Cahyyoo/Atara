import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHART_KEYS, KPI_KEYS, chartRows, dashboardLayoutFor } from "@/modules/lab/lib/analytics/dashboard-layout";
import { LAB_PERSONAS } from "@/modules/lab/capabilities";

/**
 * Each lab role's dashboard, as it was agreed, written out in full. Pinned by
 * hand so a change to what somebody sees has to be made on purpose.
 */
describe("what each role's dashboard shows", () => {
  it("gives the lab admin the whole picture", () => {
    expect(dashboardLayoutFor("LAB_ADMIN")).toEqual({
      kpis: [...KPI_KEYS],
      charts: [...CHART_KEYS],
      myScans: false,
      needsAttention: true,
      allSamples: true,
    });
  });

  it("gives the database role what was registered, and where from", () => {
    expect(dashboardLayoutFor("DATABASE")).toEqual({
      kpis: ["samples", "inProgress", "completed", "awaitingAssay"],
      charts: ["throughput", "placeSplit"],
      myScans: false,
      needsAttention: false,
      allSamples: true,
    });
  });

  it("leads the analyst with the results still to enter", () => {
    expect(dashboardLayoutFor("ANALISIS")).toEqual({
      kpis: ["awaitingAssay", "completed", "cycleTime"],
      charts: ["niDistribution", "waiting", "throughput"],
      myScans: false,
      needsAttention: false,
      allSamples: false,
    });
  });

  it("gives the operator their own shift and the samples that are stuck", () => {
    expect(dashboardLayoutFor("PREPARATOR")).toEqual({
      kpis: ["inProgress", "needsAttention"],
      charts: ["waiting", "stageHours"],
      myScans: true,
      needsAttention: true,
      allSamples: false,
    });
  });

  it("shows the all-samples table to the lab admin and the database role only", () => {
    const shown = LAB_PERSONAS.filter((persona) => dashboardLayoutFor(persona).allSamples);
    expect(shown).toEqual(["LAB_ADMIN", "DATABASE"]);
  });

  it("only links the needs-attention tile where the section it jumps to exists", () => {
    for (const persona of LAB_PERSONAS) {
      const layout = dashboardLayoutFor(persona);
      if (layout.kpis.includes("needsAttention")) expect(layout.needsAttention, persona).toBe(true);
    }
  });

  it("is what the dashboard page reads", () => {
    const page = readFileSync(
      join(process.cwd(), "src", "app", "(app)", "lab", "dashboard", "page.tsx"),
      "utf8"
    );
    expect(page).toContain("dashboardLayoutFor(persona)");
    expect(page).toContain("layout.allSamples");
  });
});

describe("chartRows", () => {
  it("gives throughput a row of its own and pairs the rest", () => {
    expect(chartRows(CHART_KEYS)).toEqual([
      "throughput",
      ["stageHours", "waiting", "niDistribution", "placeSplit"],
    ]);
  });

  it("keeps a role's order, throughput last included", () => {
    expect(chartRows(["niDistribution", "waiting", "throughput"])).toEqual([
      ["niDistribution", "waiting"],
      "throughput",
    ]);
  });

  it("leaves a lone chart in a row of one", () => {
    expect(chartRows(["throughput", "placeSplit"])).toEqual(["throughput", ["placeSplit"]]);
  });
});
