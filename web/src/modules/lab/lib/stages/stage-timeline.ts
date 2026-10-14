/**
 * When a sample entered each stage, who scanned it there, and how long it
 * stayed -- read from its scan log, for the exports.
 *
 * The same "until the next scan" rule as the dashboard's dwell time, so a
 * sheet and the dashboard never disagree about how long a stage took. Kept
 * pure, like `evaluateStageTransition`, so the rule can be checked without a
 * database.
 */

export interface TimelineLog {
  stageId: string;
  scannedAt: Date;
  preparator: string | null;
}

export interface StageVisit {
  /** When the sample was scanned into the stage. */
  at: Date;
  /** Hours until the next scan; null for the final stage of a finished sample. */
  hours: number | null;
  by: string | null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Each stage's visit. Where a correction sent a sample back to a stage it had
 * already passed, the last visit is the one kept: that is where the sample
 * actually went on from. The stage it is in now runs until `now`, unless the
 * sample is finished.
 */
export function stageTimeline(
  logs: readonly TimelineLog[],
  { now, completed }: { now: Date; completed: boolean }
): Map<string, StageVisit> {
  const ordered = [...logs].sort((a, b) => a.scannedAt.getTime() - b.scannedAt.getTime());
  const visits = new Map<string, StageVisit>();
  ordered.forEach((log, index) => {
    const next = ordered[index + 1];
    const end = next ? next.scannedAt : completed ? null : now;
    visits.set(log.stageId, {
      at: log.scannedAt,
      hours: end ? Math.round(((end.getTime() - log.scannedAt.getTime()) / HOUR_MS) * 100) / 100 : null,
      by: log.preparator,
    });
  });
  return visits;
}
