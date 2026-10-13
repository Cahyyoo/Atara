/**
 * The arithmetic of a table whose columns can be reordered and resized,
 * kept pure so it is tested without a browser.
 */

export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 480;
/** How far one arrow key press moves a column edge. */
export const WIDTH_STEP = 16;

export function clampWidth(width: number): number {
  return Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));
}

/**
 * A saved order made complete again: keys that no longer exist are dropped,
 * and columns added since it was saved go back where they belong by default
 * (after the nearest column that precedes them there).
 */
export function normalizeOrder(saved: readonly string[], defaults: readonly string[]): string[] {
  const known = new Set(defaults);
  const order = saved.filter((key, index) => known.has(key) && saved.indexOf(key) === index);
  defaults.forEach((key, defaultIndex) => {
    if (order.includes(key)) return;
    // Place it after the closest earlier default that is already placed.
    let at = 0;
    for (let index = defaultIndex - 1; index >= 0; index--) {
      const position = order.indexOf(defaults[index]);
      if (position !== -1) {
        at = position + 1;
        break;
      }
    }
    order.splice(at, 0, key);
  });
  return order;
}

/** The order with `key` moved to stand where `target` stands now. */
export function moveBefore(order: readonly string[], key: string, target: string): string[] {
  if (key === target) return [...order];
  const from = order.indexOf(key);
  const to = order.indexOf(target);
  if (from === -1 || to === -1) return [...order];
  const next = order.filter((item) => item !== key);
  // Dropping onto a column to the right lands after it, as the eye expects.
  const insertAt = next.indexOf(target) + (from < to ? 1 : 0);
  next.splice(insertAt, 0, key);
  return next;
}

/**
 * The order with `key` moved one step left or right among the `visible`
 * columns, jumping over the hidden ones in between.
 */
export function nudge(order: readonly string[], visible: readonly string[], key: string, step: -1 | 1): string[] {
  const at = visible.indexOf(key);
  const neighbour = visible[at + step];
  if (at === -1 || neighbour === undefined) return [...order];
  return moveBefore(order, key, neighbour);
}
