import { describe, expect, it, vi } from "vitest";
import {
  labelShiftDays,
  previewNote,
  resolveScanHistoryWindow,
  tallyScanHistory,
  type StageRowCount,
} from "@/lib/scan-history";
import { getShiftDate, getShiftDayBounds } from "@/lib/shift-date";
import { myScanHistoryQuerySchema } from "@/lib/validation";

/** WITA is UTC+8, so 07:00 WITA is 23:00 UTC the previous day. */
function wita(iso: string): Date {
  return new Date(`${iso}+08:00`);
}

function logsAt(...isoTimes: string[]): { scannedAt: Date }[] {
  return isoTimes.map((iso) => ({ scannedAt: wita(iso) }));
}

describe("resolveScanHistoryWindow", () => {
  it("asks for exactly one shift day when asked for one", () => {
    // The backwards-compatibility guarantee, as an assertion rather than a
    // claim. Phones already in the field send no query string, the schema
    // defaults days to 1, and this has to be byte-identical to what the route
    // computed before it took any parameters at all.
    const now = wita("2026-09-22T14:30:00");
    const window = resolveScanHistoryWindow(1, now);

    expect(window).toMatchObject(getShiftDayBounds(getShiftDate(now)));
    expect(window.firstShiftDate).toEqual(window.currentShiftDate);
  });

  it("reaches back days - 1 shift days and ends at the same instant", () => {
    const now = wita("2026-09-22T14:30:00");
    const one = resolveScanHistoryWindow(1, now);
    const fourteen = resolveScanHistoryWindow(14, now);

    expect(fourteen.to).toEqual(one.to);
    expect(fourteen.from).toEqual(
      new Date(one.from.getTime() - 13 * 24 * 60 * 60 * 1000)
    );
  });

  it("uses the shift day, not the calendar day, before 07:00", () => {
    // 01:00 WITA still belongs to the previous shift, so a one-day window
    // starting there reaches back to 07:00 the *previous* morning.
    const window = resolveScanHistoryWindow(1, wita("2026-09-22T01:00:00"));

    expect(window.from).toEqual(wita("2026-09-21T07:00:00"));
    expect(window.to).toEqual(wita("2026-09-22T07:00:00"));
  });

  it("crosses a month boundary", () => {
    const window = resolveScanHistoryWindow(3, wita("2026-10-01T09:00:00"));
    expect(window.from).toEqual(wita("2026-09-29T07:00:00"));
  });
});

describe("labelShiftDays", () => {
  it("keeps 06:59:59 on the previous shift day and moves at 07:00:00", () => {
    const labels = labelShiftDays(
      logsAt("2026-09-09T07:00:00", "2026-09-09T06:59:59")
    );

    expect(labels).toEqual(["2026-09-09", "2026-09-08"]);
  });

  it("labels a descending page that spans three days", () => {
    const labels = labelShiftDays(
      logsAt(
        "2026-09-10T09:15:00",
        "2026-09-10T07:00:00",
        "2026-09-10T06:59:59.999",
        "2026-09-09T22:00:00",
        "2026-09-09T07:00:00",
        "2026-09-08T18:00:00"
      )
    );

    expect(labels).toEqual([
      "2026-09-10",
      "2026-09-10",
      "2026-09-09",
      "2026-09-09",
      "2026-09-09",
      "2026-09-08",
    ]);
  });

  it("agrees with getShiftDate on every row", () => {
    // The cheap walk only calls getShiftDate once per day on screen, so this
    // checks the shortcut against the thing it is short-cutting.
    const logs = logsAt(
      "2026-09-10T09:15:00",
      "2026-09-10T06:59:59",
      "2026-09-09T12:00:00",
      "2026-09-08T07:00:00"
    );

    const labels = labelShiftDays(logs);
    const direct = logs.map((log) =>
      getShiftDate(log.scannedAt).toISOString().slice(0, 10)
    );

    expect(labels).toEqual(direct);
  });

  it("handles an empty page and a single row", () => {
    expect(labelShiftDays([])).toEqual([]);
    expect(labelShiftDays(logsAt("2026-09-09T12:00:00"))).toEqual(["2026-09-09"]);
  });

  it("crosses a leap day", () => {
    const labels = labelShiftDays(
      logsAt("2028-03-01T07:00:00", "2028-03-01T06:59:59")
    );
    expect(labels).toEqual(["2028-03-01", "2028-02-29"]);
  });
});

describe("previewNote", () => {
  it("treats nothing to say as no note", () => {
    expect(previewNote(null)).toBeNull();
    expect(previewNote("")).toBeNull();
    expect(previewNote("   ")).toBeNull();
  });

  it("passes a short note through, trimmed", () => {
    expect(previewNote("  Sampel basah  ")).toBe("Sampel basah");
  });

  it("cuts a long one visibly rather than silently", () => {
    const long = "a".repeat(500);
    const preview = previewNote(long)!;

    expect(preview).toHaveLength(120);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("leaves a note of exactly the limit alone", () => {
    const exact = "a".repeat(120);
    expect(previewNote(exact)).toBe(exact);
  });
});

describe("tallyScanHistory", () => {
  const groups: StageRowCount[] = [
    { stageId: "wet", _count: { _all: 7 } },
    { stageId: "dry", _count: { _all: 3 } },
  ];

  function spies(total = 10) {
    return {
      countAll: vi.fn(async () => total),
      countByStage: vi.fn(async () => groups),
    };
  }

  it("still groups by stage for the window a phone with no query string asks for", async () => {
    // The backwards-compatibility guarantee, asserted against the schema itself
    // rather than against the number 1. getMyWork() sends no query string at
    // all and renders these tallies on Home; if someone changes the schema
    // default, this fails here instead of Home silently losing its breakdown.
    const { days } = myScanHistoryQuerySchema.parse({});
    const { countAll, countByStage } = spies();

    const result = await tallyScanHistory({ days, countAll, countByStage });

    expect(countByStage).toHaveBeenCalledTimes(1);
    expect(result.byStageCounts).toEqual(groups);
  });

  it.each([2, 14, 90, 91])(
    "does not group by stage across %i days",
    async (days) => {
      // The expensive half. stage_id is in no usable index, so this grouping
      // costs one clustered PK lookup per row in the window — and the paged
      // caller that asks for ninety days never reads the result.
      const { countAll, countByStage } = spies();

      const result = await tallyScanHistory({ days, countAll, countByStage });

      expect(countByStage).not.toHaveBeenCalled();
      expect(result.byStageCounts).toEqual([]);
    }
  );

  it("takes the total from the count in both branches", async () => {
    // total used to be summed from the groups. It has to keep meaning rows in
    // the window, because pagination.totalPages is derived from it.
    for (const days of [1, 90]) {
      const { countAll, countByStage } = spies(41);
      const result = await tallyScanHistory({ days, countAll, countByStage });

      expect(result.total).toBe(41);
      expect(countAll).toHaveBeenCalledTimes(1);
    }
  });

  it("runs both counts at once", async () => {
    // Pins the concurrency, which is the thing a careless refactor would take
    // away by turning one Promise.all into two sequential awaits. The route
    // already runs this alongside two more queries; making it serial would add
    // a round trip to every page for nothing.
    let releaseCount: (n: number) => void = () => {};
    const countAll = vi.fn(
      () => new Promise<number>((resolve) => (releaseCount = resolve))
    );
    const countByStage = vi.fn(async () => groups);

    const pending = tallyScanHistory({ days: 1, countAll, countByStage });
    await Promise.resolve();

    expect(countByStage).toHaveBeenCalledTimes(1);

    releaseCount(10);
    await expect(pending).resolves.toMatchObject({ total: 10 });
  });
});
