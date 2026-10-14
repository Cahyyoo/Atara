/**
 * The lab's clock -- WITA, UTC+8 -- for reading and writing times the way
 * people on site see them, wherever the server runs. Shared by every module.
 */

/** WITA is UTC+8, with no daylight saving. */
export const WITA_OFFSET_MINUTES = 8 * 60;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The site's working day starts at 07:00 WITA, not at midnight: 06:59 still
 * belongs to the day before. The lab's shift calendar, the sign-in trail's
 * date filter and every "which day" question use this one boundary.
 */
export const WORKDAY_START_HOUR = 7;

/**
 * The instant a wall-clock reading in the lab refers to.
 *
 * The instrument, the sheet and the preparator all read the same clock, and that
 * clock is WITA — the same one the shift boundary is pinned to. Building the
 * Date from the browser's own timezone instead would store a time eight hours
 * out on a laptop set to UTC, and nothing on screen would say so.
 *
 * Returns null for a date that does not exist, rather than letting JS roll 31
 * April forward into May.
 */
export function witaWallClock(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  const utc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const date = new Date(utc - WITA_OFFSET_MINUTES * MINUTE_MS);

  // Checked before the offset is applied, where the fields are still the ones
  // that were asked for.
  const asked = new Date(utc);
  return asked.getUTCMonth() === month - 1 && asked.getUTCDate() === day ? date : null;
}

/** "2026-09-17 14:03:00" — the lab's own clock, and what `witaWallClock` reads back. */
export function formatWitaDateTime(at: Date | string | null): string | null {
  const date = typeof at === "string" ? new Date(at) : at;
  if (date === null || Number.isNaN(date.getTime())) return null;

  const shifted = new Date(date.getTime() + WITA_OFFSET_MINUTES * MINUTE_MS);
  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
  );
}

/**
 * "2026-09-11T12:28" — what `<input type="datetime-local">` holds, on the
 * lab's clock.
 *
 * The pair to [parseWitaInput], the way `toShiftDateInputValue` pairs with
 * `parseShiftDateInput`. A datetime-local box has no timezone at all: reading
 * its value with `new Date(value)` would interpret it in whatever zone the
 * browser happens to be set to, storing an instant eight hours out on a laptop
 * set to UTC with nothing on screen to say so.
 */
export function toWitaInputValue(at: Date | string | null): string {
  const formatted = formatWitaDateTime(at);
  // "2026-09-11 12:28:00" -> "2026-09-11T12:28"; the box has no seconds field.
  return formatted === null ? "" : `${formatted.slice(0, 10)}T${formatted.slice(11, 16)}`;
}

/** Reads that box back as an instant, treating what was typed as WITA. */
export function parseWitaInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;

  // witaWallClock rejects a day the month does not have rather than rolling it
  // forward, which is the whole reason for going through it.
  return witaWallClock(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0)
  );
}

/**
 * The real instants a shift day spans, which is the inverse of `getShiftDate`.
 *
 * A shift day is stored as UTC midnight, but it actually begins at 07:00 WITA —
 * one hour before that midnight in UTC terms (+8 for the timezone, −7 for the
 * start hour) — and runs for 24 hours from there.
 */
export function workdayBounds(shiftDate: Date): { from: Date; to: Date } {
  const offsetHours = WITA_OFFSET_MINUTES / 60 - WORKDAY_START_HOUR;
  const from = new Date(shiftDate.getTime() - offsetHours * HOUR_MS);
  return { from, to: new Date(from.getTime() + 24 * HOUR_MS) };
}

/** Parses "2026-09-08" back into the stored UTC-midnight Date. */
export function parseDayInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  // The regex checks the shape, not the date. Date.UTC rolls over rather than
  // failing -- month 13 becomes January of the next year and day 45 becomes
  // mid-February -- so it never produces NaN and the old check never fired.
  // A typed 2026-13-45 quietly became a real day in 2027, and a filter set to
  // it would show an empty list that read as "nothing happened".
  const rolledOver =
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day;

  return rolledOver ? null : date;
}
