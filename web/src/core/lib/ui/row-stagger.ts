/**
 * How long a row waits before it arrives.
 *
 * A stagger is only readable while it is short. At 30ms a step, a page of
 * fifty rows would finish 1.5 seconds after it started, and the last row would
 * not read as "arriving" — it would read as the table being slow. So the
 * stagger applies to the first rows and everything after them comes in with
 * the last of those.
 *
 * Pulled out of the table because there are three of them and they have drifted
 * apart before.
 */

/** Rows that each get their own step. Past this, they share the last one. */
export const STAGGER_LIMIT = 12;
/** Seconds between one row and the next. */
export const STAGGER_STEP = 0.03;

export function rowDelay(index: number): number {
  return Math.min(index, STAGGER_LIMIT) * STAGGER_STEP;
}

/** Longest any row waits — the whole stagger, from first row to last. */
export const STAGGER_CEILING = STAGGER_LIMIT * STAGGER_STEP;
