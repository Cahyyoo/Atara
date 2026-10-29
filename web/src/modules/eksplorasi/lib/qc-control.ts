import { parseNumber } from "@/core/lib/number-parse";
import type { ControlLimits, ControlPoint } from "@/modules/eksplorasi/types";

/**
 * The control charts of one OREAS standard: each of its assays in the order
 * the data source holds them, against the certified value's ±1σ, ±2σ and ±3σ
 * from the CRM List. Pure, so the arithmetic can be checked without a
 * database.
 */

/**
 * A value as a number for a chart, or null when it is not one. Values are
 * text as the lab wrote them: "1,25" is 1.25, while "<0.01", "n/a" or blank
 * are results but not points -- counted as skipped, never drawn as zero.
 */
export function chartValue(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return parseNumber(value);
}

/** The elements a standard is certified for, in the CRM List's order -- one chart each. */
export const CONTROL_ELEMENTS = ["ni", "co", "fe2o3", "al2o3", "cr2o3", "mgo", "sio2"] as const;
export type ControlElement = (typeof CONTROL_ELEMENTS)[number];

/** The CRM List's column for an element's standard deviation: "sdNi" for "ni". */
export const sdFieldOf = (element: ControlElement) => `sd${element.charAt(0).toUpperCase()}${element.slice(1)}`;

/** The test method whose certified values the charts are drawn against. */
export const CONTROL_TEST_METHOD = "Fusion XRF";

/**
 * A standard's name as both lists can agree on it. The data source writes
 * "OREAS-184", the CRM List "Oreas184": case and everything but letters and
 * digits are set aside. The SQL that finds the assays (qc-control-service.ts)
 * applies the same rule to the control column.
 */
export function crmKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The lines of one chart, from the certified value and its SD as the CRM List
 * holds them (text). Null when either is missing, not a number, or the SD is
 * not positive: there is then nothing to judge the assays against.
 */
export function controlLimits(value: string | null | undefined, sd: string | null | undefined): ControlLimits | null {
  const certified = chartValue(value);
  const sigma = chartValue(sd);
  if (certified === null || sigma === null || sigma <= 0) return null;
  return {
    certified,
    sd: sigma,
    plus1: certified + sigma,
    minus1: certified - sigma,
    plus2: certified + 2 * sigma,
    minus2: certified - 2 * sigma,
    plus3: certified + 3 * sigma,
    minus3: certified - 3 * sigma,
  };
}

/** How far a reading sits from the certified value, in SDs: +1.8 is 1.8σ above. */
export function zScore(y: number, limits: ControlLimits): number {
  return (y - limits.certified) / limits.sd;
}

export interface ControlRow {
  sampleId: string;
  /** The row's place in the data source, counting every row from 1. */
  index: number;
  /** YYYY-MM-DD. */
  date: string | null;
  value: string | null;
}

/**
 * Each assay of one element as (sample index, value). One that is not a number
 * ("<0.01", blank) is a result but not a point, and is counted as skipped.
 */
export function controlPoints(rows: readonly ControlRow[]): { points: ControlPoint[]; skipped: number } {
  const points: ControlPoint[] = [];
  let skipped = 0;
  for (const row of rows) {
    const y = chartValue(row.value);
    if (y === null) {
      skipped += 1;
      continue;
    }
    points.push({ sampleId: row.sampleId, date: row.date, x: row.index, y });
  }
  return { points, skipped };
}

/**
 * The value axis: wide enough for ±3σ and every point, with a little room so
 * neither sits on the frame. Null limits leave the range to the points alone.
 */
export function valueRange(points: readonly ControlPoint[], limits: ControlLimits | null): { min: number; max: number } | null {
  const values = [...points.map((point) => point.y), ...(limits ? [limits.minus3, limits.plus3] : [])];
  if (values.length === 0) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || Math.abs(high) || 1) * 0.08;
  return { min: low - pad, max: high + pad };
}

/** The standard table's figures for one standard and element; null where there is nothing to work them out from. */
export interface StandardFigures {
  n: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Shares (0–1) of the assays within ±1σ, ±2σ, ±3σ of the certified value, and past ±2σ. */
  within1: number | null;
  within2: number | null;
  within3: number | null;
  outside2: number | null;
}

/** A standard is expected to keep 95% of its assays within ±2σ; past 5% outside, its row is marked. */
export const OUTSIDE_2SD_LIMIT = 0.05;

/**
 * One row of the standard table: how a standard's assays of one element sit
 * about its certified value. A value that is not a number ("<0.01") is left
 * out, as on the chart; an assay exactly 2σ off is still within 2σ. The
 * shares need the CRM List's value and SD, and at least one assay.
 */
export function standardFigures(values: readonly (string | null)[], limits: ControlLimits | null): StandardFigures {
  const numbers = values.flatMap((value) => {
    const number = chartValue(value);
    return number === null ? [] : [number];
  });
  const n = numbers.length;
  if (n === 0) {
    return { n, mean: null, min: null, max: null, within1: null, within2: null, within3: null, outside2: null };
  }
  const within = (k: number) =>
    limits ? numbers.filter((number) => Math.abs(zScore(number, limits)) <= k + 1e-9).length / n : null;
  const within2 = within(2);
  return {
    n,
    mean: numbers.reduce((sum, number) => sum + number, 0) / n,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    within1: within(1),
    within2,
    within3: within(3),
    outside2: within2 === null ? null : 1 - within2,
  };
}
