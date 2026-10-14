import { z } from "zod";
import { Prisma } from "@prisma/client";
import { workdayBounds, parseDayInput } from "@/core/lib/wita-time";
import { ACTIVE_SAMPLE } from "@/modules/lab/lib/samples/soft-delete";

/** The filters a stage-activity question can carry, already parsed. */
export interface StageActivityFilters {
  search?: string;
  preparatorId?: string;
  stageId?: string;
  shiftDate?: string;
  corrections?: "only" | "exclude";
}

/**
 * One `where` for the list, the count, the summary and the export.
 *
 * Built once rather than per caller, because four places asking the same
 * question four slightly different ways is how a filter ends up applying to
 * the table and not to the download that is supposed to match it.
 *
 * A deleted sample's history is excluded along with the sample: the database
 * module hides soft-deleted records, and a trail that still lists them would
 * quietly contradict it.
 */
export function stageActivityWhere(filters: StageActivityFilters): Prisma.SampleLogWhereInput {
  // Built in one place so the deleted check cannot be dropped by a later
  // spread: the search narrows the same object rather than replacing it.
  const sample: Prisma.SampleWhereInput = { ...ACTIVE_SAMPLE };
  if (filters.search) {
    sample.sampleCode = { contains: filters.search };
  }

  const where: Prisma.SampleLogWhereInput = { sample: { is: sample } };
  if (filters.preparatorId) {
    where.preparatorId = filters.preparatorId;
  }
  if (filters.stageId) {
    where.stageId = filters.stageId;
  }
  if (filters.corrections === "only") {
    where.isCorrection = true;
  } else if (filters.corrections === "exclude") {
    where.isCorrection = false;
  }

  // A lab day, not a calendar day: the shift turns over at 07:00 WITA, so
  // this has to go through the same bounds the rest of the app uses.
  if (filters.shiftDate) {
    const parsed = parseDayInput(filters.shiftDate);
    if (parsed) {
      const { from, to } = workdayBounds(parsed);
      where.scannedAt = { gte: from, lt: to };
    }
  }

  return where;
}

/** Everything a row of the trail shows, and nothing else. */
export const stageActivitySelect = {
  id: true,
  scannedAt: true,
  isCorrection: true,
  notes: true,
  stage: { select: { id: true, key: true, name: true } },
  preparator: { select: { id: true, name: true } },
  sample: { select: { id: true, sampleCode: true } },
} satisfies Prisma.SampleLogSelect;

/**
 * Who moved which sample to which stage, and when.
 *
 * The data has been recorded since the first scan -- SampleLog carries
 * preparatorId, and there is already an index on [preparatorId, scannedAt]
 * described as "what did this preparator record this shift". What was missing
 * was any way to ask the question across more than one sample.
 *
 * `shiftDate` is a lab day, not a calendar day: the shift boundary is 07:00
 * WITA, so "today" here means the same thing it means everywhere else in the
 * app (see lib/shift-date.ts).
 */
export const STAGE_ACTIVITY_SORT_FIELDS = ["scannedAt"] as const;

export const listStageActivityQuerySchema = z.object({
  /** Matches a sample code; the preparator is chosen by id, not typed. */
  search: z.string().trim().optional(),
  preparatorId: z.string().trim().optional(),
  stageId: z.string().trim().optional(),
  /** A single lab day, as yyyy-mm-dd. Blank means every day. */
  shiftDate: z.string().trim().optional(),
  corrections: z.enum(["only", "exclude"]).optional(),
  sort: z.enum(STAGE_ACTIVITY_SORT_FIELDS).default("scannedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
