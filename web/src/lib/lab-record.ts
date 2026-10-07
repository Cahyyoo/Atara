import { Prisma, type LabRecord } from "@prisma/client";
import { parseShiftDateInput, toShiftDateInputValue } from "@/lib/shift-date";
import type { LabRecordDTO } from "@/types";
import type { IdentFilter, LabResultFilter } from "@/lib/validation";

/** Prisma returns Decimal columns as Decimal objects; DTOs expose plain numbers. */
function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

export function toLabRecordDTO(record: LabRecord): LabRecordDTO {
  return {
    id: record.id,
    sampleId: record.sampleId,
    labCode: record.labCode,
    shiftDate: toShiftDateInputValue(record.shiftDate),
    sequence: record.sequence,
    parentId: record.parentId,
    subCode: record.subCode,
    ni: toNumber(record.ni),
    fe: toNumber(record.fe),
    co: toNumber(record.co),
    sio2: toNumber(record.sio2),
    mgo: toNumber(record.mgo),
    cao: toNumber(record.cao),
    al2o3: toNumber(record.al2o3),
    cr: toNumber(record.cr),
    fe2o3: toNumber(record.fe2o3),
    cr2o3: toNumber(record.cr2o3),
    mno: toNumber(record.mno),
    na2o: toNumber(record.na2o),
    p2o5: toNumber(record.p2o5),
    tio2: toNumber(record.tio2),
    s: toNumber(record.s),
    co2: toNumber(record.co2),
    zn: toNumber(record.zn),
    sum: toNumber(record.sum),
    measurementMethod: record.measurementMethod,
    solutionId: record.solutionId,
    measurementFinished: record.measurementFinished?.toISOString() ?? null,
    placeId: record.placeId,
    rockTypeId: record.rockTypeId,
    nonProdId: record.nonProdId,
    pitId: record.pitId,
    sirId: record.sirId,
    bargingNo: record.bargingNo,
    sequenceNo: record.sequenceNo,
    sampleNo: record.sampleNo,
    sackCount: record.sackCount,
    sampleIdent: record.sampleIdent,
    remarks: record.remarks,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Shared between the list endpoint and the CSV export so both filter identically. */
export function buildLabRecordWhere(query: {
  search?: string;
  placeId?: string;
  shiftDate?: string;
  /** Shift-day range, both ends inclusive. */
  from?: string;
  to?: string;
  /**
   * Whether a result has been entered, judged by Ni alone.
   *
   * One column rather than "all five main elements": Ni is the grade the
   * mine is paid on and the first figure the lab reports, a single-column
   * test stays cheap on a large table, and "partly entered" is a state
   * the entry grid already makes visible cell by cell.
   */
  results?: LabResultFilter;
  /** Whether the record has its Sample ID yet (identity is filled in after the barcode). */
  ident?: IdentFilter;
  /** Admin-only: shows what was deleted instead of what remains. */
  deleted?: boolean;
}): Prisma.LabRecordWhereInput {
  // One or the other, never both at once: a list mixing live and deleted
  // rows would need a column to tell them apart and a rule for every
  // action offered on them.
  // Pages hold the parent records; each brings its sub-samples along, so a
  // filter that a sub matches still finds the parent it is listed under.
  const where: Prisma.LabRecordWhereInput = {
    parentId: null,
    sample: { is: query.deleted ? { deletedAt: { not: null } } : { deletedAt: null } },
  };
  const and: Prisma.LabRecordWhereInput[] = [];

  if (query.search) {
    // `sample` is already spoken for by the deleted filter above, so the
    // code search goes through `is` rather than replacing that key.
    const own = [{ labCode: { contains: query.search } }, { sampleIdent: { contains: query.search } }];
    and.push({
      OR: [
        ...own,
        { sample: { is: { sampleCode: { contains: query.search } } } },
        { subs: { some: { OR: own } } },
      ],
    });
  }
  if (query.placeId) {
    where.placeId = query.placeId;
  }
  if (query.shiftDate) {
    const shiftDate = parseShiftDateInput(query.shiftDate);
    if (shiftDate) {
      where.shiftDate = shiftDate;
    }
  } else if (query.from || query.to) {
    const from = query.from ? parseShiftDateInput(query.from) : null;
    const to = query.to ? parseShiftDateInput(query.to) : null;
    // Shift dates are stored as midnight UTC of the day, so an inclusive
    // range is simply gte/lte on those midnights.
    if (from || to) {
      where.shiftDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
  }
  if (query.results) {
    const ni = query.results === "missing" ? null : { not: null };
    and.push({ OR: [{ ni }, { subs: { some: { ni } } }] });
  }
  if (query.ident) {
    where.sampleIdent = query.ident === "missing" ? null : { not: null };
  }
  if (and.length > 0) where.AND = and;

  return where;
}

export const labRecordInclude = {
  sample: {
    select: {
      id: true,
      sampleCode: true,
      status: true,
      // Named columns rather than the whole Stage row: the tables only show the
      // name, and the row carries a TEXT description nobody reads here.
      // `key` so the tables can translate the name; without it stageLabel
      // always fell back to the stored wording.
      currentStage: { select: { id: true, key: true, name: true, sequenceOrder: true } },
    },
  },
  // Listed under their parent, in the order of their codes.
  subs: { orderBy: { subCode: "asc" } },
} satisfies Prisma.LabRecordInclude;

type IncludedRecord = Prisma.LabRecordGetPayload<{ include: typeof labRecordInclude }>;
type IncludedSample = NonNullable<IncludedRecord["sample"]>;

export function toLabRecordSampleSummary(sample: IncludedSample) {
  return {
    id: sample.id,
    sampleCode: sample.sampleCode,
    status: sample.status,
    currentStage: sample.currentStage,
  };
}

/**
 * A parent record as the tables list it, its sub-samples along with it. A sub
 * carries its parent's sample: it is the same container, and every row in the
 * table links to one.
 */
export function toLabRecordListItem(record: IncludedRecord) {
  const sample = toLabRecordSampleSummary(record.sample!);
  return {
    ...toLabRecordDTO(record),
    sample,
    subs: record.subs.map((sub) => ({ ...toLabRecordDTO(sub), sample })),
  };
}

export interface LabRecordChange {
  from: number | string | null;
  to: number | string | null;
}

/**
 * The only columns an edit can touch. Bulk save and CSV import read thousands of
 * rows purely to diff them, so they select this instead of the whole record —
 * which would drag the remarks TEXT and the code/date metadata along for nothing.
 */
export const labRecordValueSelect = {
  id: true,
  ni: true,
  fe: true,
  co: true,
  sio2: true,
  mgo: true,
  cao: true,
  al2o3: true,
  cr: true,
  fe2o3: true,
  cr2o3: true,
  mno: true,
  na2o: true,
  p2o5: true,
  tio2: true,
  s: true,
  co2: true,
  zn: true,
  sum: true,
  measurementMethod: true,
  solutionId: true,
  measurementFinished: true,
  // The identity columns come along so an update that moves one of them can be
  // diffed against what is there, and so the Sample ID can be recomposed from
  // the merged result rather than from the update alone.
  placeId: true,
  rockTypeId: true,
  nonProdId: true,
  pitId: true,
  sirId: true,
  bargingNo: true,
  sequenceNo: true,
  sampleNo: true,
  sackCount: true,
  sampleIdent: true,
  remarks: true,
} satisfies Prisma.LabRecordSelect;

export type LabRecordValues = Prisma.LabRecordGetPayload<{ select: typeof labRecordValueSelect }>;

/** Compares a stored record against an update, keeping only the columns that actually differ. */
/**
 * Flattens a stored or submitted value into something comparable and loggable.
 *
 * Decimal columns arrive as Decimal objects and dates as Date objects; both
 * compare by identity, so two equal timestamps would otherwise look like a
 * change on every save and fill the audit trail with edits nobody made.
 */
function comparable(value: unknown): number | string | null {
  if (value == null) return null;
  if (value instanceof Prisma.Decimal) return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value as number | string;
}

export function diffLabRecord(
  existing: LabRecordValues,
  update: Record<string, number | string | Date | null | undefined>
): Record<string, LabRecordChange> {
  const current = existing as unknown as Record<string, unknown>;
  const changes: Record<string, LabRecordChange> = {};

  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) {
      continue;
    }
    const before = comparable(current[key]);
    const after = comparable(value);
    if (before !== after) {
      changes[key] = { from: before, to: after };
    }
  }

  return changes;
}
