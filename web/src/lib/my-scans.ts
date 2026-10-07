import "server-only";

import { prisma } from "@/lib/prisma";
import { loadStages } from "@/lib/stages-cache";
import { resolveScanHistoryWindow } from "@/lib/scan-history";
import { toShiftDateInputValue } from "@/lib/shift-date";

export interface ShiftScanSummary {
  /** The current shift day, "YYYY-MM-DD". */
  shiftDate: string;
  total: number;
  /** How many of them stepped a sample back or past a stage. */
  corrections: number;
  /** In workflow order, only the stages actually scanned into. */
  byStage: { stageKey: string | null; stageName: string; count: number }[];
}

/**
 * The signed-in operator's own scans this shift, for their dashboard.
 *
 * The same window as the phone's "my work" (GET /api/samples/scan/mine with no
 * query string: `resolveScanHistoryWindow(1)`), so the web and the phone agree
 * on what "this shift" holds. That route is left as it is -- phones in the
 * field depend on its exact shape -- and this asks the three counts the card
 * needs, all served by @@index([operatorId, scannedAt]).
 *
 * Deleted samples count, as they do on the phone: a sample removed afterwards
 * does not undo the scan somebody made.
 */
export async function loadShiftScanSummary(userId: string): Promise<ShiftScanSummary> {
  const window = resolveScanHistoryWindow(1);
  const where = { operatorId: userId, scannedAt: { gte: window.from, lt: window.to } };

  const [byStageRows, corrections, stages] = await Promise.all([
    prisma.sampleLog.groupBy({ by: ["stageId"], where, _count: { _all: true } }),
    prisma.sampleLog.count({ where: { ...where, isCorrection: true } }),
    loadStages(),
  ]);

  const counted = new Map(byStageRows.map((row) => [row.stageId, row._count._all]));

  return {
    shiftDate: toShiftDateInputValue(window.currentShiftDate),
    // stage_id is NOT NULL, so every scan is in exactly one group.
    total: byStageRows.reduce((sum, row) => sum + row._count._all, 0),
    corrections,
    byStage: stages
      .filter((stage) => counted.has(stage.id))
      .map((stage) => ({
        stageKey: stage.key,
        stageName: stage.name,
        count: counted.get(stage.id)!,
      })),
  };
}
