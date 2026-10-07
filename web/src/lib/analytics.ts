import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadStages } from "@/lib/stages-cache";
import { ASSAY_FIELDS } from "@/lib/assay";
import { ACTIVE_SAMPLE, activeSampleWindowSql } from "@/lib/soft-delete";
import { DEFAULT_SLA_HOURS } from "@/lib/sla";
import type { SubFilter } from "@/lib/validation";
import { subsSql } from "@/lib/sub-filter-sql";

const HOUR_MS = 60 * 60 * 1000;
const NI_BUCKET = 0.25;

/**
 * The bar for samples that have no place yet. Not a place, so it is deliberately
 * not given one of the categorical hues — the chart colours those by position,
 * and letting this take one would read as a site that does not exist.
 */
export const UNPLACED_ID = "__unplaced__";
export const UNPLACED_CODE = "—";
const MAX_OVERDUE_ROWS = 200;

// A shift day starts at 07:00 WITA (UTC+8), so in UTC terms it is the calendar
// date of `timestamp + 1 hour`. That is the SQL form of `getShiftDate` below,
// and the two must stay in step.

export interface AnalyticsResult {
  range: { from: string; to: string };
  /**
   * When these figures were worked out. Cached answers keep the time they
   * were computed, so "updated at" on the dashboard never claims fresher
   * data than it has.
   */
  generatedAt: string;
  kpi: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    awaitingAssay: number;
    overdue: number;
    averageCycleHours: number | null;
  };
  throughput: { shiftDate: string; created: number; completed: number }[];
  /**
   * Stage rows carry the key as well as the stored name. The server has
   * no locale, so it must not be the thing that picks the words: left to
   * the name alone, the dashboard charts would stay in one language
   * whatever the app is set to.
   */
  stageDurations: {
    stageId: string;
    stageKey: string | null;
    stageName: string;
    averageHours: number;
    samples: number;
  }[];
  bottleneck: { stageId: string; stageKey: string | null; stageName: string; count: number }[];
  niDistribution: { bucket: string; count: number }[];
  /**
   * One entry per place, plus a trailing one for samples that have no place
   * yet, so the bars add up to the total the KPI card shows.
   */
  placeSplit: { placeId: string; code: string; count: number }[];
  overdueSamples: {
    sampleCode: string;
    labCode: string | null;
    /** What the sample is — place, rock type, pit, barging run — in one string. */
    sampleIdent: string | null;
    stageKey: string | null;
    stageName: string;
    hoursInStage: number;
    slaHours: number;
  }[];
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** COUNT()/SUM() come back as BigInt, and AVG() as a Decimal or a string. */
function num(value: unknown): number {
  return value == null ? 0 : Number(value);
}

/**
 * Every figure on the dashboard is an aggregate, so every figure is aggregated
 * in the database. Only the overdue list needs row-level data, and that is
 * filtered and capped before it leaves MySQL.
 */
export interface AnalyticsFilter {
  placeId?: string;
  rockTypeId?: string;
  nonProdId?: string;
  pitId?: string;
  sirId?: string;
  /**
   * Which records the result figures count: the samples (default), every
   * record, or the sub-samples alone. Barcode and stage counts are always
   * per sample -- a sub-sample is not a container of its own.
   */
  subs?: SubFilter;
}

/** Lab-record rows joined to the sample they belong to: their own, or their parent's. */
export function recordSampleJoinSql(alias = "r", sampleAlias = "s"): Prisma.Sql {
  const r = Prisma.raw(alias);
  const s = Prisma.raw(sampleAlias);
  const p = Prisma.raw(`${alias}_parent`);
  return Prisma.sql`LEFT JOIN lab_records ${p} ON ${p}.id = ${r}.parent_id
    JOIN samples ${s} ON ${s}.id = COALESCE(${r}.sample_id, ${p}.sample_id)`;
}

/**
 * The identity dimensions the dashboard can be sliced by, each paired with the
 * column it lives in.
 *
 * One list, two shapes: the Prisma `where` below and the raw-SQL fragments the
 * aggregates use. Keeping them derived from this rather than written out twice
 * is the whole point — two hand-maintained lists drift, and the symptom is a
 * dashboard whose cards quietly disagree with each other.
 */
const IDENTITY_COLUMNS = {
  placeId: "place_id",
  rockTypeId: "rock_type_id",
  nonProdId: "non_prod_id",
  pitId: "pit_id",
  sirId: "sir_id",
} as const satisfies Record<Exclude<keyof AnalyticsFilter, "subs">, string>;

type IdentityKey = keyof typeof IDENTITY_COLUMNS;

function activeIdentity(filter: AnalyticsFilter): [IdentityKey, string][] {
  return (Object.keys(IDENTITY_COLUMNS) as IdentityKey[])
    .map((key) => [key, filter[key]] as const)
    .filter((entry): entry is [IdentityKey, string] => Boolean(entry[1]));
}

/** `AND <alias>.<column> = ?` for each active dimension, joined with AND. */
export function identitySql(filter: AnalyticsFilter, alias: string): Prisma.Sql {
  const active = activeIdentity(filter);
  if (active.length === 0) return Prisma.empty;

  return Prisma.join(
    active.map(([key, value]) =>
      // The column name is from the map above, never from the request; only the
      // value is interpolated, and that stays a bound parameter.
      Prisma.sql`AND ${Prisma.raw(`${alias}.${IDENTITY_COLUMNS[key]}`)} = ${value}`
    ),
    " "
  );
}

export async function buildAnalytics(
  from: Date,
  to: Date,
  filter: AnalyticsFilter = {}
): Promise<AnalyticsResult> {
  const now = new Date();
  // The places name and order the split below. A handful of rows, read once,
  // so the chart shows every configured site rather than only those that
  // happen to have samples in the window.
  const [stages, places] = await Promise.all([
    loadStages(),
    prisma.masterOption.findMany({
      where: { kind: "PLACE", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true },
    }),
  ]);

  const lastStage = stages[stages.length - 1];
  const analysisOrder = Math.max(1, stages.length - 1);

  /**
   * Everything the filter says about a sample on its own. Kept apart from the
   * code-type clause below because the lab-record aggregate can apply that one
   * directly, rather than reaching back through the sample to its own row.
   */
  const sampleScope: Prisma.SampleWhereInput = {
    createdAt: { gte: from, lte: to },
    // Deleted samples leave every chart and every count. Spread here, so
    // each aggregate below inherits it from the one scope.
    ...ACTIVE_SAMPLE,
  };

  const identity = Object.fromEntries(activeIdentity(filter));
  const inRange: Prisma.SampleWhereInput = {
    ...sampleScope,
    ...(Object.keys(identity).length > 0 ? { labRecord: { is: identity } } : {}),
  };

  /*
   * The same two conditions for the raw aggregates, as composable fragments.
   *
   * The join is safe for counting: lab_records.sample_id is UNIQUE, so it
   * matches at most one row and cannot multiply the rows being counted. Values
   * stay bound parameters — they arrive from the query string.
   */
  const rawCodeJoin =
    activeIdentity(filter).length > 0
      ? Prisma.sql`JOIN lab_records lr ON lr.sample_id = s.id ${identitySql(filter, "lr")}`
      : Prisma.empty;

  /**
   * "Past its SLA" written as a database predicate rather than a JS filter.
   * Doing it here is what stops the query reading thousands of rows to return
   * a couple of hundred: at a 90-day window it was 3,747 rows and 1.3 seconds,
   * three quarters of the whole endpoint.
   */
  const overdueWhere = {
    ...inRange,
    status: { not: "COMPLETED" as const },
    currentStageId: { in: stages.map((stage) => stage.id) },
    stageEnteredAt: { lt: new Date(now.getTime() - DEFAULT_SLA_HOURS * HOUR_MS) },
  };

  const [
    statusCounts,
    bottleneckCounts,
    placeCounts,
    awaitingAssay,
    createdPerDay,
    completedPerDay,
    niBuckets,
    stageGaps,
    cycle,
    overdueCount,
    overdueRows,
  ] = await Promise.all([
    prisma.sample.groupBy({ by: ["status"], where: inRange, _count: { _all: true } }),

    prisma.sample.groupBy({
      by: ["currentStageId"],
      where: { ...inRange, status: { not: "COMPLETED" }, currentStageId: { not: null } },
      _count: { _all: true },
    }),

    prisma.labRecord.groupBy({
      by: ["placeId"],
      // Its own column, not a hop back through the sample. A sub-sample
      // carries its parent's place, and its parent's sample decides the window.
      where: {
        ...identity,
        ...(filter.subs === "all"
          ? { OR: [{ sample: { is: sampleScope } }, { parent: { is: { sample: { is: sampleScope } } } }] }
          : filter.subs === "subs"
            ? { parent: { is: { sample: { is: sampleScope } } } }
            : { sample: { is: sampleScope } }),
      },
      _count: { _all: true },
    }),

    // Reached analysis, yet not a single assay column has been filled in.
    prisma.sample.count({
      where: {
        ...inRange,
        currentStage: { sequenceOrder: { gte: analysisOrder } },
        labRecord: { is: Object.fromEntries(ASSAY_FIELDS.map((field) => [field.key, null])) },
      },
    }),

    prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT DATE_FORMAT(DATE_ADD(s.createdAt, INTERVAL 1 HOUR), '%Y-%m-%d') AS day,
             COUNT(*) AS total
      FROM samples s
      ${rawCodeJoin}
      WHERE ${activeSampleWindowSql(from, to)}
      GROUP BY day
    `,

    lastStage
      ? prisma.$queryRaw<{ day: string; total: bigint }[]>`
          SELECT DATE_FORMAT(DATE_ADD(l.scanned_at, INTERVAL 1 HOUR), '%Y-%m-%d') AS day,
                 COUNT(*) AS total
          FROM sample_logs l
          JOIN samples s ON s.id = l.sample_id
          ${rawCodeJoin}
          WHERE ${activeSampleWindowSql(from, to)}
            AND l.stage_id = ${lastStage.id}
          GROUP BY day
        `
      : Promise.resolve([]),

    prisma.$queryRaw<{ bucket: Prisma.Decimal; total: bigint }[]>`
      SELECT FLOOR(r.ni / ${NI_BUCKET}) * ${NI_BUCKET} AS bucket, COUNT(*) AS total
      FROM lab_records r
      ${recordSampleJoinSql("r")}
      WHERE ${activeSampleWindowSql(from, to)}
        AND r.ni IS NOT NULL
        ${identitySql(filter, "r")}
        ${subsSql(filter.subs ?? "parents", "r")}
      GROUP BY bucket
      ORDER BY bucket
    `,

    // Dwell time is the gap between one scan and the next for the same sample.
    prisma.$queryRaw<{ stage_id: string; avg_seconds: number | null; total: bigint }[]>`
      SELECT stage_id, AVG(TIMESTAMPDIFF(SECOND, scanned_at, next_at)) AS avg_seconds,
             COUNT(*) AS total
      FROM (
        SELECT l.stage_id, l.scanned_at,
               LEAD(l.scanned_at) OVER (PARTITION BY l.sample_id ORDER BY l.scanned_at) AS next_at
        FROM sample_logs l
        JOIN samples s ON s.id = l.sample_id
        ${rawCodeJoin}
        WHERE ${activeSampleWindowSql(from, to)}
      ) paired
      WHERE next_at IS NOT NULL AND next_at >= scanned_at
      GROUP BY stage_id
    `,

    // Cycle time counts only samples whose most recent scan is the final stage.
    lastStage
      ? prisma.$queryRaw<{ avg_seconds: number | null }[]>`
          SELECT AVG(TIMESTAMPDIFF(SECOND, first_at, last_at)) AS avg_seconds
          FROM (
            SELECT l.sample_id,
                   MIN(l.scanned_at) AS first_at,
                   MAX(l.scanned_at) AS last_at,
                   SUBSTRING_INDEX(
                     GROUP_CONCAT(l.stage_id ORDER BY l.scanned_at DESC), ',', 1
                   ) AS last_stage_id
            FROM sample_logs l
            JOIN samples s ON s.id = l.sample_id
            ${rawCodeJoin}
            WHERE ${activeSampleWindowSql(from, to)}
            GROUP BY l.sample_id
          ) spans
          WHERE spans.last_stage_id = ${lastStage.id}
        `
      : Promise.resolve([]),

    // Counted separately from the list below, so the figure stays exact even
    // though only the worst few hundred are ever sent.
    prisma.sample.count({ where: overdueWhere }),

    // Longest-sitting first, and capped. SQL has already applied each stage's
    // own rule, so nothing here needs filtering afterwards.
    prisma.sample.findMany({
      where: overdueWhere,
      select: {
        sampleCode: true,
        currentStageId: true,
        stageEnteredAt: true,
        labRecord: { select: { labCode: true, sampleIdent: true } },
      },
      orderBy: { stageEnteredAt: "asc" },
      take: MAX_OVERDUE_ROWS,
    }),
  ]);

  // --- KPI counts -----------------------------------------------------------
  const byStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const total = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

  // --- throughput per shift day ---------------------------------------------
  const days = new Map<string, { created: number; completed: number }>();
  const bump = (day: string, key: "created" | "completed", count: number) => {
    const entry = days.get(day) ?? { created: 0, completed: 0 };
    entry[key] += count;
    days.set(day, entry);
  };
  for (const row of createdPerDay) bump(row.day, "created", num(row.total));
  for (const row of completedPerDay) bump(row.day, "completed", num(row.total));

  const throughput = [...days.entries()]
    .map(([shiftDate, counts]) => ({ shiftDate, ...counts }))
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));

  // --- time spent per stage --------------------------------------------------
  const gapByStage = new Map(stageGaps.map((row) => [row.stage_id, row]));
  const stageDurations = stages.map((stage) => {
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

  const averageCycleSeconds = cycle[0]?.avg_seconds ?? null;

  // --- where samples are sitting right now -----------------------------------
  const byStage = new Map(bottleneckCounts.map((row) => [row.currentStageId, row._count._all]));
  const bottleneck = stages.map((stage) => ({
    stageId: stage.id,
    stageKey: stage.key,
    stageName: stage.name,
    count: byStage.get(stage.id) ?? 0,
  }));

  // --- grade distribution -----------------------------------------------------
  const niDistribution = niBuckets.map((row) => {
    const bucket = Number(row.bucket);
    return {
      bucket: `${bucket.toFixed(2)}–${(bucket + NI_BUCKET).toFixed(2)}`,
      count: num(row.total),
    };
  });

  // --- split by place ---------------------------------------------------------
  const byPlace = new Map(placeCounts.map((row) => [row.placeId, row._count._all]));
  const placeSplit = places.map((place) => ({
    placeId: place.id,
    code: place.code,
    count: byPlace.get(place.id) ?? 0,
  }));

  // Identity is optional at generate time, so a sample can exist with no place.
  // Building the bars from the master list alone dropped that group in silence,
  // and the chart then disagreed with the total sitting right above it — which
  // is how people stop trusting a dashboard. Only added when there is something
  // to add, so an ordinary day's chart is unchanged.
  const unplaced = byPlace.get(null) ?? 0;
  if (unplaced > 0) {
    placeSplit.push({ placeId: UNPLACED_ID, code: UNPLACED_CODE, count: unplaced });
  }

  // --- samples stuck past their stage SLA -------------------------------------
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const stageKeys = new Map(stages.map((stage) => [stage.id, stage.key]));

  const overdue = overdueRows
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

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    generatedAt: now.toISOString(),
    kpi: {
      total,
      pending: byStatus.get("PENDING") ?? 0,
      inProgress: byStatus.get("IN_PROGRESS") ?? 0,
      completed: byStatus.get("COMPLETED") ?? 0,
      awaitingAssay,
      overdue: overdueCount,
      averageCycleHours: averageCycleSeconds === null ? null : round(num(averageCycleSeconds) / 3600),
    },
    throughput,
    stageDurations,
    bottleneck,
    niDistribution,
    placeSplit,
    overdueSamples: overdue,
  };
}
