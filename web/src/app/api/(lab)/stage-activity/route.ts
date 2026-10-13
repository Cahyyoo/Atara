import { prisma } from "@/core/lib/prisma";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { TtlCache } from "@/core/lib/ttl-cache";

const SUMMARY_TTL_MS = 15_000;
const activityTotals = new TtlCache<number>(SUMMARY_TTL_MS, 64);
const activitySummaries = new TtlCache<{ operatorId: string; stageId: string; _count: { _all: number } }[]>(
  SUMMARY_TTL_MS,
  64
);

import {
  listStageActivityQuerySchema,
  stageActivitySelect,
  stageActivityWhere,
} from "@/modules/lab/lib/stages/stage-activity";

/**
 * Who moved which sample to which stage.
 *
 * Admin only. The data itself is not new — SampleLog has recorded the
 * operator on every scan since the beginning, and the single-sample timeline
 * has always shown it. What was missing was any way to ask across samples.
 *
 * The per-person summary comes back with the list rather than from a second
 * endpoint, because the two must agree: a summary counted against different
 * filters than the rows below it is worse than no summary.
 */
export const GET = route({ capability: "viewActivity" }, async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const query = listStageActivityQuerySchema.parse({
    search: searchParams.get("search") ?? undefined,
    operatorId: searchParams.get("operatorId") ?? undefined,
    stageId: searchParams.get("stageId") ?? undefined,
    shiftDate: searchParams.get("shiftDate") ?? undefined,
    corrections: searchParams.get("corrections") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    order: searchParams.get("order") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  const where = stageActivityWhere(query);

  /**
   * The summary ignores only the operator filter, so picking a person
   * narrows the rows while the row of totals still shows everyone. Without
   * that, choosing a name would leave a summary of one — and no way back to
   * the comparison that made you click.
   */
  const summaryWhere = stageActivityWhere({ ...query, operatorId: undefined });

  // The count and the per-person summary each read every matching scan
  // through its sample: with no day chosen that is the whole history, tens
  // of seconds at a million scans, again on every page turn. Shared for a
  // few seconds per filter; the rows below are always read fresh.
  const [total, logs, byOperator, operators] = await Promise.all([
    activityTotals.get(JSON.stringify(where), () => prisma.sampleLog.count({ where })),
    prisma.sampleLog.findMany({
      where,
      select: stageActivitySelect,
      orderBy: [{ [query.sort]: query.order }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    // Counted in the database, so the totals stay right however the list is
    // paged. Grouped by both so one pass answers "who" and "who, per stage".
    activitySummaries.get(JSON.stringify(summaryWhere), async () => {
      const rows = await prisma.sampleLog.groupBy({
        by: ["operatorId", "stageId"],
        where: summaryWhere,
        _count: { _all: true },
      });
      return rows.map((row) => ({ operatorId: row.operatorId, stageId: row.stageId, _count: { _all: row._count._all } }));
    }),
    // Names for the ids the grouping returns, and for the filter's own list.
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const nameOf = new Map(operators.map((operator) => [operator.id, operator.name]));
  const perOperator = new Map<string, { total: number; byStage: Record<string, number> }>();

  for (const row of byOperator) {
    const entry = perOperator.get(row.operatorId) ?? { total: 0, byStage: {} };
    entry.total += row._count._all;
    entry.byStage[row.stageId] = (entry.byStage[row.stageId] ?? 0) + row._count._all;
    perOperator.set(row.operatorId, entry);
  }

  return jsonSuccess({
    logs: logs.map((log) => ({
      id: log.id,
      scannedAt: log.scannedAt.toISOString(),
      isCorrection: log.isCorrection,
      notes: log.notes,
      stageId: log.stage.id,
      stageKey: log.stage.key,
      stageName: log.stage.name,
      operatorId: log.operator.id,
      operatorName: log.operator.name,
      sampleId: log.sample.id,
      sampleCode: log.sample.sampleCode,
    })),
    // Busiest first: the question a summary answers is who is carrying it.
    summary: [...perOperator.entries()]
      .map(([operatorId, entry]) => ({
        operatorId,
        operatorName: nameOf.get(operatorId) ?? operatorId,
        total: entry.total,
        byStage: entry.byStage,
      }))
      .sort((a, b) => b.total - a.total || a.operatorName.localeCompare(b.operatorName)),
    operators,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  });
});
