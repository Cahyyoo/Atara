import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { loadStages } from "@/modules/lab/lib/stages/stages-cache";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import { ACTIVE_SAMPLE, activeSampleWindowSql } from "@/modules/lab/lib/samples/soft-delete";
import { DEFAULT_SLA_HOURS } from "@/modules/lab/lib/stages/sla";
import { subsSql } from "@/modules/lab/lib/records/sub-filter-sql";
import type { AnalyticsFilter, AnalyticsResult } from "@/modules/lab/lib/analytics/analytics-types";
import { activeIdentity, identitySql, recordSampleJoinSql } from "@/modules/lab/lib/analytics/analytics-sql";
import {
  bottleneckOf,
  HOUR_MS,
  MAX_OVERDUE_ROWS,
  niDistributionOf,
  NI_BUCKET,
  num,
  overdueOf,
  placeSplitOf,
  round,
  stageDurationsOf,
  throughputOf,
} from "@/modules/lab/lib/analytics/analytics-shape";

/**
 * Every figure on the dashboard is an aggregate, so every figure is aggregated
 * in the database, all queries at once; only the overdue list needs row-level
 * data, and that is filtered and capped before it leaves MySQL. The shaping
 * of each figure is in analytics-shape.ts.
 */
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
      FROM lab_samples s
      ${rawCodeJoin}
      WHERE ${activeSampleWindowSql(from, to)}
      GROUP BY day
    `,

    lastStage
      ? prisma.$queryRaw<{ day: string; total: bigint }[]>`
          SELECT DATE_FORMAT(DATE_ADD(l.scanned_at, INTERVAL 1 HOUR), '%Y-%m-%d') AS day,
                 COUNT(*) AS total
          FROM lab_sample_logs l
          JOIN lab_samples s ON s.id = l.sample_id
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
        FROM lab_sample_logs l
        JOIN lab_samples s ON s.id = l.sample_id
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
            FROM lab_sample_logs l
            JOIN lab_samples s ON s.id = l.sample_id
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

  const byStatus = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const total = statusCounts.reduce((sum, row) => sum + row._count._all, 0);
  const averageCycleSeconds = cycle[0]?.avg_seconds ?? null;

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
    throughput: throughputOf(createdPerDay, completedPerDay),
    stageDurations: stageDurationsOf(stages, stageGaps),
    bottleneck: bottleneckOf(stages, bottleneckCounts),
    niDistribution: niDistributionOf(niBuckets),
    placeSplit: placeSplitOf(places, placeCounts),
    overdueSamples: overdueOf(stages, overdueRows, now),
  };
}
