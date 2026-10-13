/**
 * Turning the dashboard's raw aggregates into the figures it shows. Pure, so
 * each figure's rules can be tested without a database.
 */
import type { Prisma } from "@prisma/client";
import { DEFAULT_SLA_HOURS } from "@/modules/lab/lib/stages/sla";
import { UNPLACED_CODE, UNPLACED_ID, type AnalyticsResult } from "@/modules/lab/lib/analytics/analytics-types";

export const HOUR_MS = 60 * 60 * 1000;
export const NI_BUCKET = 0.25;

export const MAX_OVERDUE_ROWS = 200;

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** COUNT()/SUM() come back as BigInt, and AVG() as a Decimal or a string. */
export function num(value: unknown): number {
  return value == null ? 0 : Number(value);
}

type Stage = { id: string; key: string | null; name: string };

/** Barcodes registered and samples finished, per shift day, in date order. */
export function throughputOf(
  createdPerDay: { day: string; total: bigint }[],
  completedPerDay: { day: string; total: bigint }[]
): AnalyticsResult["throughput"] {
  const days = new Map<string, { created: number; completed: number }>();
  const bump = (day: string, key: "created" | "completed", count: number) => {
    const entry = days.get(day) ?? { created: 0, completed: 0 };
    entry[key] += count;
    days.set(day, entry);
  };
  for (const row of createdPerDay) bump(row.day, "created", num(row.total));
  for (const row of completedPerDay) bump(row.day, "completed", num(row.total));

  return [...days.entries()]
    .map(([shiftDate, counts]) => ({ shiftDate, ...counts }))
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
}

/** Time spent per stage: the average gap between a scan into it and the next scan. */
export function stageDurationsOf(
  stages: Stage[],
  stageGaps: { stage_id: string; avg_seconds: number | null; total: bigint }[]
): AnalyticsResult["stageDurations"] {
  const gapByStage = new Map(stageGaps.map((row) => [row.stage_id, row]));
  return stages.map((stage) => {
    const row = gapByStage.get(stage.id);
    const samples = num(row?.total);
    return {
      stageId: stage.id,
      stageKey: stage.key,
      stageName: stage.name,
      averageHours: samples > 0 ? round(num(row?.avg_seconds) / 3600) : 0,
      samples,
    };
  });
}

/** Where samples are sitting right now, stage by stage. */
export function bottleneckOf(
  stages: Stage[],
  counts: { currentStageId: string | null; _count: { _all: number } }[]
): AnalyticsResult["bottleneck"] {
  const byStage = new Map(counts.map((row) => [row.currentStageId, row._count._all]));
  return stages.map((stage) => ({
    stageId: stage.id,
    stageKey: stage.key,
    stageName: stage.name,
    count: byStage.get(stage.id) ?? 0,
  }));
}

/** The Ni grade distribution, in NI_BUCKET-wide bars. */
export function niDistributionOf(
  buckets: { bucket: Prisma.Decimal; total: bigint }[]
): AnalyticsResult["niDistribution"] {
  return buckets.map((row) => {
    const bucket = Number(row.bucket);
    return { bucket: `${bucket.toFixed(2)}–${(bucket + NI_BUCKET).toFixed(2)}`, count: num(row.total) };
  });
}

/**
 * Samples per place, every configured place in its order. Identity is
 * optional at generate time, so a sample can exist with no place: building
 * the bars from the master list alone dropped that group in silence, and the
 * chart then disagreed with the total above it -- which is how people stop
 * trusting a dashboard. Only added when there is something to add.
 */
export function placeSplitOf(
  places: { id: string; code: string }[],
  counts: { placeId: string | null; _count: { _all: number } }[]
): AnalyticsResult["placeSplit"] {
  const byPlace = new Map(counts.map((row) => [row.placeId, row._count._all]));
  const split = places.map((place) => ({ placeId: place.id, code: place.code, count: byPlace.get(place.id) ?? 0 }));
  const unplaced = byPlace.get(null) ?? 0;
  if (unplaced > 0) split.push({ placeId: UNPLACED_ID, code: UNPLACED_CODE, count: unplaced });
  return split;
}

/** Samples stuck past their stage SLA, longest-sitting first. */
export function overdueOf(
  stages: Stage[],
  rows: {
    sampleCode: string;
    currentStageId: string | null;
    stageEnteredAt: Date | null;
    labRecord: { labCode: string; sampleIdent: string | null } | null;
  }[],
  now: Date
): AnalyticsResult["overdueSamples"] {
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const stageKeys = new Map(stages.map((stage) => [stage.id, stage.key]));
  return rows
    .map((sample) => ({
      sampleCode: sample.sampleCode,
      labCode: sample.labRecord?.labCode ?? null,
      sampleIdent: sample.labRecord?.sampleIdent ?? null,
      stageKey: stageKeys.get(sample.currentStageId!) ?? null,
      stageName: stageNames.get(sample.currentStageId!) ?? "",
      hoursInStage: round((now.getTime() - sample.stageEnteredAt!.getTime()) / HOUR_MS),
      slaHours: DEFAULT_SLA_HOURS,
    }))
    .sort((a, b) => b.hoursInStage - a.hoursInStage);
}
