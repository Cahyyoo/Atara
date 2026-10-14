/**
 * The figures the Formulir Analysis Result works out rather than measures.
 *
 * Pure, so the record dialog's live preview, the paste preview and the export
 * all compute them one way.
 */

/**
 * Moisture content, %: how much of the wet sample's weight was water.
 *
 *   MC = (W0 - Wd) * 100 / (W0 - Wp)
 *
 * Wp the pan, W0 the pan with the wet sample, Wd the pan with the dried one.
 * Null while a weight is missing, or when the pan weighs as much as the wet
 * sample and there is nothing to divide by.
 */
export function moistureContent(
  wp: number | null | undefined,
  w0: number | null | undefined,
  wd: number | null | undefined
): number | null {
  if (wp == null || w0 == null || wd == null) return null;
  const wet = w0 - wp;
  if (wet === 0) return null;
  return ((w0 - wd) * 100) / wet;
}

/** The silica-magnesia ratio, SiO2 / MgO. Null without both, or with no MgO. */
export function smRatio(sio2: number | null | undefined, mgo: number | null | undefined): number | null {
  if (sio2 == null || mgo == null || mgo === 0) return null;
  return sio2 / mgo;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Lead time, in hours: from the sample being received to its report, to one
 * decimal. Empty until both have happened, and for scans that run backwards.
 */
export function leadTimeHours(receivedAt: Date | null | undefined, reportAt: Date | null | undefined): number | null {
  if (!receivedAt || !reportAt) return null;
  const hours = (reportAt.getTime() - receivedAt.getTime()) / HOUR_MS;
  return hours < 0 ? null : Math.round(hours * 10) / 10;
}

/** The moments the form reads off a sample's scans. */
export interface StageMoments {
  /** The first scan into Received: when the sample arrived. */
  receivedAt: Date | null;
  /** The first scan into wet preparation: the day it was weighed. */
  wetPrepAt: Date | null;
  /** The last scan into Report: after a correction, the one that stands. */
  reportAt: Date | null;
}

/**
 * Received, wet preparation and report, from a sample's scans in any order.
 * A stage scanned twice keeps its first scan, except the report: a sample sent
 * back from it was only reported once it was scanned there again.
 */
export function stageMoments(
  logs: readonly { stageId: string; scannedAt: Date }[],
  ids: { receivedId?: string; wetPrepId?: string; reportId?: string }
): StageMoments {
  const moments: StageMoments = { receivedAt: null, wetPrepAt: null, reportAt: null };
  const ordered = [...logs].sort((a, b) => a.scannedAt.getTime() - b.scannedAt.getTime());
  for (const log of ordered) {
    if (log.stageId === ids.receivedId && !moments.receivedAt) moments.receivedAt = log.scannedAt;
    if (log.stageId === ids.wetPrepId && !moments.wetPrepAt) moments.wetPrepAt = log.scannedAt;
    if (log.stageId === ids.reportId) moments.reportAt = log.scannedAt;
  }
  return moments;
}

/**
 * Whether a weighing makes sense, once all three are in: the pan is lighter
 * than the wet sample in it, and the dried one lies between the two. Returns
 * the reason it does not, or null. Partial weighings pass: they are being
 * filled in.
 */
export function weighingProblem(
  wp: number | null | undefined,
  w0: number | null | undefined,
  wd: number | null | undefined
): string | null {
  if (wp == null || w0 == null || wd == null) return null;
  if (w0 <= wp) return "W0 (pan with the wet sample) must be heavier than Wp (the pan).";
  if (wd < wp || wd > w0) return "Wd (pan with the dried sample) must lie between Wp and W0.";
  return null;
}
