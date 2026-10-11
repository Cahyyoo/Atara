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

/** A WITA calendar day as a day count, so two of them subtract to whole days. */
function witaDay(at: Date): number {
  return Math.floor((at.getTime() + 8 * 60 * 60 * 1000) / 86_400_000);
}

/**
 * Lead time, in days: from wet preparation to the report, counted in WITA
 * calendar days the way the form does (17 Dec to 19 Dec is 2).
 */
export function leadTimeDays(wetPrepAt: Date | null | undefined, reportAt: Date | null | undefined): number | null {
  if (!wetPrepAt || !reportAt) return null;
  return witaDay(reportAt) - witaDay(wetPrepAt);
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
