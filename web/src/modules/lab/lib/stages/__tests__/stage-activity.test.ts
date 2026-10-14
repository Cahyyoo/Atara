import { describe, expect, it } from "vitest";
import { stageActivityWhere } from "@/modules/lab/lib/stages/stage-activity";
import { workdayBounds, parseDayInput } from "@/core/lib/wita-time";

/**
 * The filter behind the trail, the summary and the export.
 *
 * All three ask the same question, and the failure they share is silent: a
 * download that quietly covers a different set than the rows it was started
 * from still produces a perfectly valid file. So the builder is one function
 * and this is what holds it to its promises.
 */

describe("deleted samples", () => {
  /**
   * The database module hides soft-deleted samples. A trail that still listed
   * their history would contradict it, and nobody would notice until someone
   * asked why a deleted sample has an audit entry.
   */
  it("are excluded, always", () => {
    const filters = [
      {},
      { search: "SMPL" },
      { preparatorId: "u1" },
      { stageId: "s1" },
      { corrections: "only" as const },
      { shiftDate: "2026-09-22" },
      { search: "SMPL", preparatorId: "u1", stageId: "s1", corrections: "exclude" as const },
    ];

    for (const filter of filters) {
      const where = stageActivityWhere(filter);
      expect(where.sample).toEqual(expect.objectContaining({ is: expect.any(Object) }));
      expect((where.sample as { is: { deletedAt: null } }).is.deletedAt).toBeNull();
    }
  });

  it("stays excluded when a search narrows the same sample filter", () => {
    // The search used to replace the sample clause rather than narrow it,
    // which would have dropped the deleted check with it.
    const where = stageActivityWhere({ search: "SMPL-2026" });
    const sample = (where.sample as { is: Record<string, unknown> }).is;

    expect(sample.deletedAt).toBeNull();
    expect(sample.sampleCode).toEqual({ contains: "SMPL-2026" });
  });
});

describe("the shift day", () => {
  /**
   * A lab day is not a calendar day here: the shift turns over at 07:00 WITA.
   * If this window came from the browser's midnight, a morning scan would
   * land on the wrong day and every per-person total would be wrong with it.
   */
  it("uses the lab's own boundary, not midnight", () => {
    const where = stageActivityWhere({ shiftDate: "2026-09-22" });
    const expected = workdayBounds(parseDayInput("2026-09-22")!);

    expect(where.scannedAt).toEqual({ gte: expected.from, lt: expected.to });
  });

  it("covers exactly one day, with no gap and no overlap at the seam", () => {
    const first = stageActivityWhere({ shiftDate: "2026-09-22" }).scannedAt as {
      gte: Date;
      lt: Date;
    };
    const second = stageActivityWhere({ shiftDate: "2026-09-23" }).scannedAt as {
      gte: Date;
      lt: Date;
    };

    // One day's end is the next day's start: a scan belongs to one shift, and
    // to exactly one. `lt` rather than `lte` is what keeps it from being both.
    expect(first.lt.getTime()).toBe(second.gte.getTime());
    expect(first.lt.getTime() - first.gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("is left open when no day is chosen", () => {
    expect(stageActivityWhere({}).scannedAt).toBeUndefined();
  });

  it("is left open rather than guessed when the date is unreadable", () => {
    // Better to show every day than to silently show one nobody asked for.
    for (const bad of ["", "not-a-date", "2026-13-45", "22/09/2026"]) {
      expect(stageActivityWhere({ shiftDate: bad }).scannedAt).toBeUndefined();
    }
  });
});

describe("the other filters", () => {
  it("passes the preparator and the stage through untouched", () => {
    const where = stageActivityWhere({ preparatorId: "user-1", stageId: "stage-2" });

    expect(where.preparatorId).toBe("user-1");
    expect(where.stageId).toBe("stage-2");
  });

  it("separates corrections in both directions", () => {
    expect(stageActivityWhere({ corrections: "only" }).isCorrection).toBe(true);
    expect(stageActivityWhere({ corrections: "exclude" }).isCorrection).toBe(false);
    // Not set at all, rather than set to false: the default shows both.
    expect(stageActivityWhere({}).isCorrection).toBeUndefined();
  });

  it("adds nothing for a filter that was not asked for", () => {
    const where = stageActivityWhere({});

    expect(where.preparatorId).toBeUndefined();
    expect(where.stageId).toBeUndefined();
    expect(where.isCorrection).toBeUndefined();
    expect(where.scannedAt).toBeUndefined();
  });
});
