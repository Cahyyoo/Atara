/** Reading the instrument's "Measurement Finished" time out of a sheet cell. */
import { witaWallClock } from "@/core/lib/wita-time";

/**
 * Accepts the date-times a spreadsheet writes, and only those it can read
 * without guessing.
 *
 * Month-first, because that is what the instrument writes: "3/11/2026" off
 * its export means 11 March. Where month-first cannot be a date ("13/05/2026")
 * the day-first reading is taken instead, since only one of the two can be
 * right.
 *
 * The order matters and used to be the other way round. Day-first succeeds on
 * "3/11/2026" — day 3, month 11 — so the fallback never ran and every such row
 * was stored eight months out with nothing to show for it. Which way round is
 * a property of the instrument, not of arithmetic, so the guess cannot be left
 * to whichever reading happens to parse; see readMeasurementFinished for what
 * catches it when this is wrong again.
 *
 * Every cell is read as a reading of the lab's own clock, which is WITA. A
 * trailing "Z" would make the same text an absolute instant instead, and the
 * two differ by eight hours, so that form is refused rather than quietly read
 * as the wrong one.
 */
export function parseSheetDateTime(raw: string): Date | null {
  const text = raw.trim();
  if (!text) return null;

  const match = text.match(
    /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!match) return null;

  const [, first, part2, third, hh = "0", mm = "0", ss = "0"] = match;
  const time = [Number(hh), Number(mm), Number(ss)] as const;

  const build = (year: number, month: number, day: number) =>
    witaWallClock(year, month, day, ...time);

  // "2026-09-17 14:03" — unambiguous, so it is read as written.
  if (first.length === 4) return build(Number(first), Number(part2), Number(third));
  if (third.length !== 4) return null;

  return (
    build(Number(third), Number(first), Number(part2)) ??
    build(Number(third), Number(part2), Number(first))
  );
}

/** How far ahead of now a measurement may be dated before it is refused. */
const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000;

export type MeasurementTime =
  | { ok: true; value: Date }
  | { ok: false; reason: "unreadable" | "future" };

/**
 * Reads a measurement time, and refuses one the instrument cannot have made.
 *
 * Parsing and the sanity check are one function on purpose. Reversing the
 * month-first order fixes today's sheet but not the kind of fault it is: an
 * ambiguous date read the wrong way round, silently. A future date is what
 * that fault looks like from either direction — a day-first sheet read
 * month-first lands in the future just as readily — so the check is the part
 * that generalises, and a parser that could be used without it is a guard
 * waiting to be left out.
 *
 * `now` is a parameter so this stays testable without freezing the clock, and
 * `parseSheetDateTime` stays pure for the same reason. A day of grace, because
 * an instrument PC whose clock runs fast is a nuisance, not a wrong date.
 */
export function readMeasurementFinished(raw: string, now: Date = new Date()): MeasurementTime {
  const parsed = parseSheetDateTime(raw);
  if (parsed === null) return { ok: false, reason: "unreadable" };
  if (parsed.getTime() > now.getTime() + FUTURE_GRACE_MS) {
    return { ok: false, reason: "future" };
  }
  return { ok: true, value: parsed };
}
