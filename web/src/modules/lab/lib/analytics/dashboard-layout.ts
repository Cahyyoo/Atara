import type { LabPersona } from "@/modules/lab/capabilities";

/**
 * What each lab role's dashboard shows, in one table.
 *
 * Every role lands on the dashboard, and it used to show everybody the same
 * six figures and five charts. Most of them answer somebody else's question:
 * the analyst does not need samples-per-place, the operator does not need the
 * Ni distribution. Each role now gets the part of the overview its work asks
 * about, in the order it asks.
 *
 * Pure, so the whole table is tested without rendering anything. Who may
 * export stays with permissions.ts; this file only says what is worth putting
 * on the screen.
 */

export const KPI_KEYS = [
  "samples",
  "inProgress",
  "completed",
  "cycleTime",
  "awaitingAssay",
  "needsAttention",
] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

export const CHART_KEYS = [
  "throughput",
  "stageHours",
  "waiting",
  "niDistribution",
  "placeSplit",
] as const;
export type ChartKey = (typeof CHART_KEYS)[number];

export interface DashboardLayout {
  /** In display order; the first is the highlighted tile. */
  kpis: readonly KpiKey[];
  /** In display order; throughput, when present, runs the full width. */
  charts: readonly ChartKey[];
  /** The signed-in operator's own scans this shift. */
  myScans: boolean;
  /** Samples past their stage SLA, with the table of them. */
  needsAttention: boolean;
  /** The all-time samples table at the bottom. */
  allSamples: boolean;
}

const LAYOUTS: Record<LabPersona, DashboardLayout> = {
  // The whole picture: this is who looks after all of it.
  LAB_ADMIN: {
    kpis: KPI_KEYS,
    charts: CHART_KEYS,
    myScans: false,
    needsAttention: true,
    allSamples: true,
  },
  // What has been registered, and where it came from.
  DATABASE: {
    kpis: ["samples", "inProgress", "completed", "awaitingAssay"],
    charts: ["throughput", "placeSplit"],
    myScans: false,
    needsAttention: false,
    allSamples: true,
  },
  // The queue of results still to enter leads; then what came out of it.
  ANALISIS: {
    kpis: ["awaitingAssay", "completed", "cycleTime"],
    charts: ["niDistribution", "waiting", "throughput"],
    myScans: false,
    needsAttention: false,
    allSamples: false,
  },
  // Their own shift, and the samples that are stuck on the way through.
  PREPARATOR: {
    kpis: ["inProgress", "needsAttention"],
    charts: ["waiting", "stageHours"],
    myScans: true,
    needsAttention: true,
    allSamples: false,
  },
};

export function dashboardLayoutFor(persona: LabPersona): DashboardLayout {
  return LAYOUTS[persona];
}

/**
 * The charts as rows: throughput alone on its row, since it has a column per
 * day and needs the width; every run of other charts between them shares a
 * two-column grid. Keeps each role's order rather than imposing one.
 */
export function chartRows(charts: readonly ChartKey[]): (ChartKey | ChartKey[])[] {
  const rows: (ChartKey | ChartKey[])[] = [];
  for (const key of charts) {
    const last = rows.at(-1);
    if (key === "throughput") rows.push(key);
    else if (Array.isArray(last)) last.push(key);
    else rows.push([key]);
  }
  return rows;
}
