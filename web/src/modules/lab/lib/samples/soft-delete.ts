import { Prisma } from "@prisma/client";

/**
 * The one definition of "this sample still exists".
 *
 * A deleted sample must disappear from every list, every export, every chart
 * and every scan. Thirteen files read samples, and the failure mode of writing
 * the filter thirteen times is silent: miss one and deleted rows quietly come
 * back somewhere nobody is looking, which is worse than not offering delete at
 * all. So the predicate is written once and spread.
 */
export const ACTIVE_SAMPLE = { deletedAt: null } satisfies Prisma.SampleWhereInput;

/** The same rule seen from a lab record, which owns no copy of the flag. */
export const ACTIVE_SAMPLE_RELATION = {
  sample: { is: ACTIVE_SAMPLE },
} satisfies Prisma.LabRecordWhereInput;

/**
 * The same rule for a record that may be a sub-sample: a sub has no sample of
 * its own and lives exactly as long as its parent's does. Kept under `AND` so
 * it can sit beside another `OR` on the same where.
 */
export const ACTIVE_LAB_RECORD = {
  AND: [
    {
      OR: [
        { sample: { is: ACTIVE_SAMPLE } },
        { parentId: { not: null }, parent: { is: { sample: { is: ACTIVE_SAMPLE } } } },
      ],
    },
  ],
} satisfies Prisma.LabRecordWhereInput;

/**
 * The same rule for the raw analytics queries, which every join aliases `s`.
 *
 * Deliberately bundled with the date window rather than offered on its own:
 * the two always belong together, and a fragment that could be used without
 * this one is a filter waiting to be forgotten.
 */
export function activeSampleWindowSql(from: Date, to: Date, alias = "s"): Prisma.Sql {
  const column = Prisma.raw(alias);
  return Prisma.sql`${column}.createdAt >= ${from} AND ${column}.createdAt <= ${to} AND ${column}.deleted_at IS NULL`;
}
