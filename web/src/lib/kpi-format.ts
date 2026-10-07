/**
 * How a KPI figure reads while it is still counting.
 *
 * Split out of the card because this is the part that goes wrong. A counter
 * animates through fractions — 1234 is reached by way of 1233.61 — so whatever
 * formats the final number has to survive being handed one of those. The old
 * code called `toLocaleString()` straight on the value, which was fine for an
 * integer sitting still and would have printed "1,233.617" mid-count.
 *
 * Every function here must give the same answer for an exact value as the
 * static version did, or the number would land on something different from
 * what it counted towards.
 */

/** A whole count of things: samples, records, people. */
export function formatCount(value: number, locale?: string): string {
  // Math.round(-0.2) is -0, and (-0).toLocaleString() prints "-0" -- a minus
  // sign flickering onto a tile that counts up from nothing. Adding zero
  // normalises it, because in IEEE-754 -0 + 0 is +0.
  return (Math.round(value) + 0).toLocaleString(locale);
}

/** Average hours, to one decimal, as the cycle-time tile has always shown it. */
export function formatHours(value: number): string {
  return `${value.toFixed(1)} h`;
}

/** What a tile shows when there is no figure at all — not zero, absent. */
export const NO_VALUE = "\u2014";
