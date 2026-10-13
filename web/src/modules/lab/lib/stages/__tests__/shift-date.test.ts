import { describe, expect, it } from "vitest";
import { formatShiftDate, getShiftDate, toShiftDateInputValue } from "@/modules/lab/lib/stages/shift-date";
import { workdayBounds, parseDayInput } from "@/core/lib/wita-time";
import { formatWitaDateTime, parseWitaInput, toWitaInputValue, witaWallClock } from "@/core/lib/wita-time";

/** WITA is UTC+8, so 07:00 WITA is 23:00 UTC the previous day. */
function wita(iso: string): Date {
  return new Date(`${iso}+08:00`);
}

function shiftDayOf(iso: string): string {
  return formatShiftDate(getShiftDate(wita(iso)));
}

describe("getShiftDate", () => {
  it("keeps 06:59:59 on the previous shift day", () => {
    expect(shiftDayOf("2026-09-09T06:59:59")).toBe("20260908");
  });

  it("starts a new shift day at exactly 07:00:00", () => {
    expect(shiftDayOf("2026-09-09T07:00:00")).toBe("20260909");
  });

  it("keeps the whole working day on one shift day", () => {
    expect(shiftDayOf("2026-09-09T07:00:00")).toBe("20260909");
    expect(shiftDayOf("2026-09-09T12:00:00")).toBe("20260909");
    expect(shiftDayOf("2026-09-09T23:59:59")).toBe("20260909");
    expect(shiftDayOf("2026-09-10T00:30:00")).toBe("20260909");
    expect(shiftDayOf("2026-09-10T06:59:59")).toBe("20260909");
  });

  it("rolls over the month at the shift boundary, not at midnight", () => {
    expect(shiftDayOf("2026-10-01T06:59:59")).toBe("20260930");
    expect(shiftDayOf("2026-10-01T07:00:00")).toBe("20261001");
  });

  it("rolls over the year at the shift boundary", () => {
    expect(shiftDayOf("2027-01-01T06:59:59")).toBe("20261231");
    expect(shiftDayOf("2027-01-01T07:00:00")).toBe("20270101");
  });

  it("handles a leap day", () => {
    expect(shiftDayOf("2028-02-29T08:00:00")).toBe("20280229");
    expect(shiftDayOf("2028-03-01T06:00:00")).toBe("20280229");
  });

  it("depends only on the instant, never on how the Date was built", () => {
    const fromWita = new Date("2026-09-09T07:00:00+08:00");
    const fromUtc = new Date("2026-09-08T23:00:00Z");
    const fromEpoch = new Date(fromUtc.getTime());

    expect(fromWita.getTime()).toBe(fromUtc.getTime());
    expect(getShiftDate(fromWita).toISOString()).toBe(getShiftDate(fromUtc).toISOString());
    expect(getShiftDate(fromEpoch).toISOString()).toBe(getShiftDate(fromUtc).toISOString());
  });

  it("returns UTC midnight so the stored date has no time component", () => {
    const shiftDate = getShiftDate(wita("2026-09-09T15:30:00"));
    expect(shiftDate.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });
});

describe("shift date formatting", () => {
  it("formats for the lab code and for date inputs", () => {
    const shiftDate = getShiftDate(wita("2026-09-08T10:00:00"));
    expect(formatShiftDate(shiftDate)).toBe("20260908");
    expect(toShiftDateInputValue(shiftDate)).toBe("2026-09-08");
  });

  it("pads single-digit months and days", () => {
    const shiftDate = getShiftDate(wita("2026-01-05T10:00:00"));
    expect(formatShiftDate(shiftDate)).toBe("20260105");
    expect(toShiftDateInputValue(shiftDate)).toBe("2026-01-05");
  });

  it("round-trips through the date-input format", () => {
    const shiftDate = getShiftDate(wita("2026-09-08T10:00:00"));
    const parsed = parseDayInput(toShiftDateInputValue(shiftDate));
    expect(parsed?.toISOString()).toBe(shiftDate.toISOString());
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(parseDayInput("08/09/2026")).toBeNull();
    expect(parseDayInput("2026-9-8")).toBeNull();
    expect(parseDayInput("")).toBeNull();
    expect(parseDayInput("not a date")).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseDayInput("  2026-09-08  ")?.toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });
});

describe("workdayBounds", () => {
  it("spans exactly 24 hours", () => {
    const { from, to } = workdayBounds(getShiftDate(new Date("2026-09-10T05:00:00Z")));
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("starts at 07:00 WITA, which is 23:00 UTC the day before", () => {
    const shiftDate = getShiftDate(new Date("2026-09-10T05:00:00Z")); // 13:00 WITA
    const { from } = workdayBounds(shiftDate);
    expect(from.toISOString()).toBe("2026-09-09T23:00:00.000Z");
  });

  it("round-trips: every instant in the window maps back to the same shift day", () => {
    const shiftDate = getShiftDate(new Date("2026-09-10T05:00:00Z"));
    const { from, to } = workdayBounds(shiftDate);

    expect(getShiftDate(from).getTime()).toBe(shiftDate.getTime());
    expect(getShiftDate(new Date(to.getTime() - 1)).getTime()).toBe(shiftDate.getTime());
    // One millisecond past the end already belongs to the next shift day.
    expect(getShiftDate(to).getTime()).toBe(shiftDate.getTime() + 24 * 60 * 60 * 1000);
  });

  it("puts 06:59 WITA in the previous shift day and 07:00 in the new one", () => {
    // 06:59:59 WITA on 10 Sep is 22:59:59Z on 9 Sep.
    const before = new Date("2026-09-09T22:59:59Z");
    const after = new Date("2026-09-09T23:00:00Z");

    const beforeBounds = workdayBounds(getShiftDate(before));
    const afterBounds = workdayBounds(getShiftDate(after));

    expect(beforeBounds.to.getTime()).toBe(afterBounds.from.getTime());
    expect(before >= beforeBounds.from && before < beforeBounds.to).toBe(true);
    expect(after >= afterBounds.from && after < afterBounds.to).toBe(true);
  });
});

/**
 * A wall-clock reading in the lab is WITA — the same clock the shift boundary
 * is pinned to, not the browser's. These two are inverses, which is what lets
 * an exported sheet be filled in and pasted straight back.
 */
describe("WITA wall clock", () => {
  it("reads a reading of the lab clock as the instant it names", () => {
    expect(witaWallClock(2026, 9, 17, 14, 3)?.toISOString()).toBe("2026-09-17T06:03:00.000Z");
  });

  it("does not depend on the machine's own timezone", () => {
    // Built from UTC parts throughout, so the same text is the same instant
    // whether this runs in Makassar or in London.
    expect(witaWallClock(2026, 1, 1, 0, 0, 0)?.toISOString()).toBe("2025-12-31T16:00:00.000Z");
  });

  it("refuses a day the month does not have", () => {
    expect(witaWallClock(2026, 4, 31)).toBeNull();
    expect(witaWallClock(2026, 13, 1)).toBeNull();
  });

  it("refuses an impossible time", () => {
    expect(witaWallClock(2026, 9, 17, 25, 0)).toBeNull();
    expect(witaWallClock(2026, 9, 17, 12, 61)).toBeNull();
  });

  it("formats an instant back to the lab's clock", () => {
    expect(formatWitaDateTime("2026-09-17T06:03:00.000Z")).toBe("2026-09-17 14:03:00");
  });

  it("round-trips: what the export writes is what the paste reads back", () => {
    const stored = new Date("2026-09-17T06:03:00.000Z");
    const exported = formatWitaDateTime(stored)!;

    const [date, time] = exported.split(" ");
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes, seconds] = time.split(":").map(Number);

    expect(witaWallClock(year, month, day, hours, minutes, seconds)?.toISOString()).toBe(
      stored.toISOString()
    );
  });

  it("returns null rather than a bad string when there is nothing to format", () => {
    expect(formatWitaDateTime(null)).toBeNull();
    expect(formatWitaDateTime("not a date")).toBeNull();
  });
});

/**
 * Asserted as instants, never as `getHours()`. This laptop is set to WITA, so
 * a test that read the local clock would pass no matter which zone the code
 * used, and fail on a build machine set to UTC. 12:28 WITA is 04:28Z.
 */
describe("the datetime-local box, on the lab's clock", () => {
  it("fills the box from a stored instant", () => {
    expect(toWitaInputValue("2026-09-11T04:28:00.000Z")).toBe("2026-09-11T12:28");
  });

  it("reads what was typed as WITA, not as the browser's zone", () => {
    expect(parseWitaInput("2026-09-11T12:28")?.toISOString()).toBe("2026-09-11T04:28:00.000Z");
  });

  it("round-trips without drifting", () => {
    const stored = "2026-09-11T04:28:00.000Z";
    expect(parseWitaInput(toWitaInputValue(stored))?.toISOString()).toBe(stored);
  });

  // 00:00–07:00 WITA belongs to the previous shift day, and lands on the day
  // before in UTC. The conversion must not quietly lose the date.
  it("crosses midnight correctly", () => {
    expect(parseWitaInput("2026-09-11T02:00")?.toISOString()).toBe("2026-09-10T18:00:00.000Z");
    expect(toWitaInputValue("2026-09-10T18:00:00.000Z")).toBe("2026-09-11T02:00");
  });

  it("accepts a seconds field without insisting on one", () => {
    expect(parseWitaInput("2026-09-11T12:28:45")?.toISOString()).toBe("2026-09-11T04:28:45.000Z");
  });

  it("refuses a day the month does not have rather than rolling it forward", () => {
    expect(parseWitaInput("2026-04-31T08:00")).toBeNull();
    expect(parseWitaInput("2026-09-11T25:00")).toBeNull();
  });

  // An empty box means "not recorded", which has to reach the server as null.
  // Reading it as a date would store the Epoch and call it a measurement.
  it("treats an empty or unreadable box as nothing", () => {
    expect(parseWitaInput("")).toBeNull();
    expect(parseWitaInput("   ")).toBeNull();
    expect(parseWitaInput("11/09/2026 12:28")).toBeNull();
    expect(toWitaInputValue(null)).toBe("");
  });
});

describe("parseDayInput", () => {
  it("reads a well-formed day", () => {
    const parsed = parseDayInput("2026-09-22");

    expect(parsed).not.toBeNull();
    expect(parsed!.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("refuses anything that is not yyyy-mm-dd", () => {
    for (const bad of ["", "  ", "22/09/2026", "2026-9-2", "not-a-date"]) {
      expect(parseDayInput(bad)).toBeNull();
    }
  });

  /**
   * The regression this exists for. The regex checks the shape, and Date.UTC
   * rolls over rather than failing: month 13 becomes January of the next year
   * and day 45 becomes mid-February, so the old NaN check never fired. A
   * filter set to a typo quietly showed a real but different day, and an
   * empty result reads as "nothing happened" rather than "that is not a date".
   */
  it("refuses a date that only looks like one", () => {
    expect(parseDayInput("2026-13-45")).toBeNull();
    expect(parseDayInput("2026-00-10")).toBeNull();
    expect(parseDayInput("2026-09-31")).toBeNull();
    expect(parseDayInput("2026-02-30")).toBeNull();
  });

  it("still accepts the awkward real ones", () => {
    // 2028 is a leap year; 2026 is not, and the day above proves it refuses.
    expect(parseDayInput("2028-02-29")).not.toBeNull();
    expect(parseDayInput("2026-12-31")).not.toBeNull();
    expect(parseDayInput("2026-01-01")).not.toBeNull();
  });
});
