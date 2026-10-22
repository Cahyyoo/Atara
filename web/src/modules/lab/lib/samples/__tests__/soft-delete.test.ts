import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { ACTIVE_SAMPLE, ACTIVE_SAMPLE_RELATION, activeSampleWindowSql } from "@/modules/lab/lib/samples/soft-delete";
import { buildLabRecordWhere } from "@/modules/lab/lib/records/lab-record";

/**
 * These read like statements of the obvious, and that is the point. Thirteen
 * files read samples; the whole reason for one shared predicate is that a
 * forgotten filter fails silently, so the shape of the predicate itself is
 * worth pinning.
 */
describe("the active-sample predicate", () => {
  it("means exactly 'not deleted'", () => {
    expect(ACTIVE_SAMPLE).toEqual({ deletedAt: null });
  });

  it("reaches through the relation for a lab record", () => {
    expect(ACTIVE_SAMPLE_RELATION).toEqual({ sample: { is: { deletedAt: null } } });
  });
});

describe("the raw analytics window", () => {
  const from = new Date("2026-09-01T00:00:00.000Z");
  const to = new Date("2026-09-30T23:59:59.000Z");

  /**
   * Bundled with the date range on purpose. A fragment that could be used
   * without the deleted check is a filter waiting to be left out of the sixth
   * query somebody adds.
   */
  it("carries the deleted check along with the date range", () => {
    const sql = activeSampleWindowSql(from, to).sql;
    expect(sql).toContain("s.createdAt >=");
    expect(sql).toContain("s.createdAt <=");
    expect(sql).toContain("s.deleted_at IS NULL");
  });

  it("keeps the dates as bound parameters rather than inlining them", () => {
    const fragment = activeSampleWindowSql(from, to);
    expect(fragment.values).toEqual([from, to]);
  });

  it("follows the alias the query actually uses", () => {
    expect(activeSampleWindowSql(from, to, "smp").sql).toContain("smp.deleted_at IS NULL");
  });

  it("composes into a query without losing either condition", () => {
    const query = Prisma.sql`SELECT 1 FROM lab_samples s WHERE ${activeSampleWindowSql(from, to)}`;
    expect(query.sql.replace(/\s+/g, " ")).toContain("deleted_at IS NULL");
    expect(query.values).toEqual([from, to]);
  });
});

describe("buildLabRecordWhere", () => {
  it("hides deleted samples from the ordinary list", () => {
    expect(buildLabRecordWhere({})).toEqual({ parentId: null, sample: { is: { deletedAt: null } } });
  });

  // One or the other, never mixed: a list holding both would need a column to
  // tell them apart and a rule for every action offered on a row.
  it("shows only deleted samples when asked for them", () => {
    expect(buildLabRecordWhere({ deleted: true })).toEqual({
      parentId: null,
      sample: { is: { deletedAt: { not: null } } },
    });
  });

  /**
   * The trap this guards. The search branch also filters on `sample`, and
   * written as a bare object it would replace the deleted filter rather than
   * sit beside it — quietly putting deleted rows back into every search.
   */
  it("keeps the deleted filter while searching by code", () => {
    const where = buildLabRecordWhere({ search: "SMPL-2026" });

    expect(where.sample).toEqual({ is: { deletedAt: null } });
    const search = (where.AND as { OR?: unknown[] }[])[0].OR;
    expect(search).toContainEqual({ sample: { is: { sampleCode: { contains: "SMPL-2026" } } } });
  });

  it("still applies the other filters alongside it", () => {
    const where = buildLabRecordWhere({ placeId: "place-1", shiftDate: "2026-09-20" });

    expect(where.sample).toEqual({ is: { deletedAt: null } });
    expect(where.placeId).toBe("place-1");
    expect(where.shiftDate).toBeInstanceOf(Date);
  });
});
