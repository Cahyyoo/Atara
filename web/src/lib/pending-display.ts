/**
 * When a loading indicator should be on screen, given when the wait started.
 *
 * Two thresholds, and between them they are the whole difference between a
 * skeleton that helps and one that makes the app feel broken:
 *
 *   DELAY  Below this, show nothing. A skeleton that appears and disappears
 *          inside 80ms does not read as loading, it reads as a glitch — and a
 *          flicker is more annoying than a pause you never noticed.
 *
 *   FLOOR  Once it is up, leave it up this long. An indicator that vanishes
 *          40ms after appearing produces exactly the same twitch from the
 *          other side.
 *
 * The rule these obey: **nothing here may delay real work.** FLOOR holds the
 * *indicator* on screen; it never holds the data back, and it only applies to
 * a wait that had already passed DELAY. A request that finishes in 30ms
 * renders its result at 30ms, with no indicator ever shown.
 *
 * Pure so it can be tested against a clock rather than against a screen.
 */

/** How long a wait must last before it is worth mentioning. */
export const DELAY_MS = 200;
/** How long an indicator stays once it has appeared. */
export const FLOOR_MS = 300;

export interface PendingWindow {
  /** Whether the indicator should be on screen at `now`. */
  visible: boolean;
  /**
   * When to look again, in ms from `now`, or null if nothing further will
   * change on its own. A caller schedules one timer from this rather than
   * polling.
   */
  recheckIn: number | null;
}

/**
 * @param startedAt  When the wait began, or null if nothing is pending.
 * @param now        The current time.
 * @param settledAt  When the wait ended, or null if it is still going.
 */
export function pendingWindow(
  startedAt: number | null,
  now: number,
  settledAt: number | null = null
): PendingWindow {
  if (startedAt === null) return { visible: false, recheckIn: null };

  const shownAt = startedAt + DELAY_MS;

  // Still inside the quiet window: nothing is shown, and it may never be.
  if (now < shownAt) {
    // Settling before the indicator was ever due means it is simply skipped.
    if (settledAt !== null && settledAt < shownAt) return { visible: false, recheckIn: null };
    return { visible: false, recheckIn: shownAt - now };
  }

  // Past the quiet window, so the indicator is up. It leaves once the work is
  // done AND it has had its minimum time on screen.
  if (settledAt === null) return { visible: true, recheckIn: null };

  const leavesAt = Math.max(settledAt, shownAt + FLOOR_MS);
  if (now < leavesAt) return { visible: true, recheckIn: leavesAt - now };
  return { visible: false, recheckIn: null };
}
