import { WITA_OFFSET_MINUTES, WORKDAY_START_HOUR } from "@/core/lib/wita-time";

/**
 * Lab shift calendar.
 *
 * A working day does not run from midnight to midnight: the shift changes at
 * 07:00, so 06:59 still belongs to the previous shift day. The boundary is
 * pinned to WITA (UTC+8) so codes do not drift when the server runs in another
 * timezone.
 */
export const SHIFT_TIMEZONE_OFFSET_MINUTES = WITA_OFFSET_MINUTES;
export const SHIFT_START_HOUR = WORKDAY_START_HOUR;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** The shift day an instant belongs to, as a UTC-midnight Date. */
export function getShiftDate(at: Date = new Date()): Date {
  const shifted = new Date(
    at.getTime() + SHIFT_TIMEZONE_OFFSET_MINUTES * MINUTE_MS - SHIFT_START_HOUR * HOUR_MS
  );
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
}


/** "20260908" — the date segment of a lab code. */
export function formatShiftDate(shiftDate: Date): string {
  const year = shiftDate.getUTCFullYear();
  const month = String(shiftDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shiftDate.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/** "2026-09-08" — the shape used by <input type="date"> and by the DTOs. */
export function toShiftDateInputValue(shiftDate: Date): string {
  const formatted = formatShiftDate(shiftDate);
  return `${formatted.slice(0, 4)}-${formatted.slice(4, 6)}-${formatted.slice(6, 8)}`;
}

