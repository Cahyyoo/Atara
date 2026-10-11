import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadStages } from "@/lib/stages-cache";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { toShiftDateInputValue } from "@/lib/shift-date";
import {
  labelShiftDays,
  previewNote,
  resolveScanHistoryWindow,
  tallyScanHistory,
} from "@/lib/scan-history";
import { myScanHistoryQuerySchema } from "@/lib/validation";

/**
 * What the signed-in operator has recorded, across shift days.
 *
 * Open to everybody in the lab module rather than to an admin: this exists so
 * an operator can see their own work, and it only ever reads their own rows.
 *
 * **Phones already in the field call this with no query string at all.** Every
 * parameter defaults to the behaviour this route had before it took any — one
 * shift day, a hundred rows, page one — so there is no legacy branch to keep
 * in step: the defaults are the old behaviour. `shiftDate`, `total`, `byStage`
 * and `logs` keep their names and their meanings, and the new keys are purely
 * additive.
 *
 * Soft-deleted samples are deliberately NOT filtered out, and this is not an
 * ACTIVE_SAMPLE call site somebody forgot. This is a receipt of work an
 * operator actually did; deleting the sample afterwards does not undo the
 * shift they spent on it. Applying the predicate here would quietly erase
 * somebody's record of their own week.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireCapability(request, "viewDashboard");

    const { searchParams } = new URL(request.url);
    const query = myScanHistoryQuerySchema.parse({
      days: searchParams.get("days") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const window = resolveScanHistoryWindow(query.days);
    const where = {
      operatorId: session.userId,
      scannedAt: { gte: window.from, lt: window.to },
    };

    const [{ total, byStageCounts }, stages, logs] = await Promise.all([
      // Counted in the database, so the totals stay right even though the page
      // below is one slice of them, and this total is also what tells the client
      // how many pages there are.
      //
      // The split between the two counts is the expensive decision, and it
      // lives in tallyScanHistory with the numbers written out: the groupBy
      // that used to supply `total` re-read the whole window on every page for
      // a tally the paged caller never looks at.
      //
      // `total` is unchanged in meaning and in value. stage_id is NOT NULL, so
      // every log lands in exactly one group and the old sum over those groups
      // was always just the row count.
      tallyScanHistory({
        days: query.days,
        countAll: () => prisma.sampleLog.count({ where }),
        // Mapped to the plain shape rather than cast to it. groupBy infers its
        // generic from the return type it is handed, so returning the call
        // directly makes TypeScript try to unify Prisma's args type with
        // StageRowCount[] and fail. Assigning first and mapping after keeps the
        // inference local, avoids an `as`, and makes the boundary real: nothing
        // downstream depends on a Prisma type.
        countByStage: async () => {
          const rows = await prisma.sampleLog.groupBy({
            by: ["stageId"],
            where,
            _count: { _all: true },
          });
          return rows.map((row) => ({
            stageId: row.stageId,
            _count: { _all: row._count._all },
          }));
        },
      }),
      loadStages(),
      prisma.sampleLog.findMany({
        where,
        // Exactly the shape of @@index([operatorId, scannedAt]): equality on
        // the leading column, range and ordering on the second. MySQL walks
        // that index backwards — no filesort, no temporary table.
        orderBy: { scannedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          scannedAt: true,
          isCorrection: true,
          notes: true,
          // stageId rather than the stage relation: `stages` above is already
          // the whole table, loaded to order byStage. Reading it again through
          // the relation is a second round trip for rows we are holding.
          stageId: true,
          sample: { select: { sampleCode: true } },
        },
      }),
    ]);

    const counted = new Map(byStageCounts.map((row) => [row.stageId, row._count._all]));
    const stageById = new Map(stages.map((stage) => [stage.id, stage]));
    const shiftDays = labelShiftDays(logs);

    return jsonSuccess({
      // Unchanged meaning: the CURRENT shift day, not the start of the window.
      // The phone leans on this to say "today" without consulting its own
      // clock, and its offline fallback leans on a cached copy meaning the
      // same thing. The window start is a separate, new key.
      shiftDate: toShiftDateInputValue(window.currentShiftDate),
      total,
      // Kept in workflow order rather than by size, so the row reads as a pipeline.
      byStage: stages
        .filter((stage) => counted.has(stage.id))
        .map((stage) => ({
          stageKey: stage.key,
          stageName: stage.name,
          count: counted.get(stage.id)!,
        })),
      logs: logs.map((log, index) => {
        const stage = stageById.get(log.stageId);
        return {
          sampleCode: log.sample.sampleCode,
          // The key travels with the name: this server has no locale, so
          // the phone is what turns a stage into words.
          stageKey: stage?.key ?? null,
          stageName: stage?.name ?? "",
          scannedAt: log.scannedAt.toISOString(),
          isCorrection: log.isCorrection,
          // The shift day this scan was filed under, computed here because the
          // 07:00 WITA boundary lives here. See labelShiftDays.
          shiftDate: shiftDays[index],
          notes: previewNote(log.notes),
        };
      }),
      days: query.days,
      fromShiftDate: toShiftDateInputValue(window.firstShiftDate),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
