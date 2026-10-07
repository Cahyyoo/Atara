import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTIVE_LAB_RECORD, ACTIVE_SAMPLE_RELATION } from "@/lib/soft-delete";
import type { SubFilter } from "@/lib/validation";
import {
  EXPECTED_GAPS,
  IDENTITY_GAPS,
  QUALITY_PAGE_SIZE,
  type IdentityGap,
  type QualityCheck,
  type QualityList,
  type QualityRow,
} from "@/lib/data-quality-checks";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Each gap as a lab-record condition. */
const GAP_WHERE: Record<IdentityGap, Prisma.LabRecordWhereInput> = {
  place: { placeId: null },
  rockType: { rockTypeId: null },
  pit: { pitId: null },
  bargingNo: { OR: [{ bargingNo: null }, { bargingNo: "" }] },
  sampleIdent: { sampleIdent: null },
  nonProd: { nonProdId: null },
  sir: { sirId: null },
};

export interface QualityQuery {
  check: QualityCheck;
  /** Identity check only: one column, or every expected one when absent. */
  gap?: IdentityGap;
  days: number;
  page: number;
  /**
   * Results check only: the samples (default), every record, or the
   * sub-samples alone. Identity is a sample's own -- a sub copies its
   * parent's -- so the identity check always looks at samples.
   */
  subs?: SubFilter;
}

/** Which records a check (and column) covers, among live samples only. */
export function qualityWhere(query: QualityQuery, now: Date = new Date()): Prisma.LabRecordWhereInput {
  if (query.check === "results") {
    const subs = query.subs ?? "parents";
    return {
      ...(subs === "parents" ? ACTIVE_SAMPLE_RELATION : ACTIVE_LAB_RECORD),
      ...(subs === "subs" ? { parentId: { not: null } } : {}),
      ni: null,
      createdAt: { lt: new Date(now.getTime() - query.days * DAY_MS) },
    };
  }
  return {
    ...ACTIVE_SAMPLE_RELATION,
    ...(query.gap ? GAP_WHERE[query.gap] : { OR: EXPECTED_GAPS.map((gap) => GAP_WHERE[gap]) }),
  };
}

export const qualitySelect = {
  labCode: true,
  sampleIdent: true,
  createdAt: true,
  placeId: true,
  rockTypeId: true,
  pitId: true,
  bargingNo: true,
  nonProdId: true,
  sirId: true,
  sample: {
    select: {
      sampleCode: true,
      status: true,
      currentStage: { select: { key: true, name: true } },
    },
  },
  // A sub-sample shows the container it was taken from.
  parent: {
    select: {
      sample: {
        select: {
          sampleCode: true,
          status: true,
          currentStage: { select: { key: true, name: true } },
        },
      },
    },
  },
} as const satisfies Prisma.LabRecordSelect;

type QualityRecord = Prisma.LabRecordGetPayload<{ select: typeof qualitySelect }>;

/** The columns this record is missing, in the order the page lists them. */
export function gapsOf(record: Omit<QualityRecord, "sample" | "parent" | "labCode" | "createdAt">): IdentityGap[] {
  const empty: Record<IdentityGap, boolean> = {
    place: record.placeId === null,
    rockType: record.rockTypeId === null,
    pit: record.pitId === null,
    bargingNo: !record.bargingNo,
    sampleIdent: record.sampleIdent === null,
    nonProd: record.nonProdId === null,
    sir: record.sirId === null,
  };
  return IDENTITY_GAPS.filter((gap) => empty[gap]);
}

export function toQualityRow(record: QualityRecord, now: Date = new Date()): QualityRow {
  const sample = (record.sample ?? record.parent?.sample)!;
  return {
    sampleCode: sample.sampleCode,
    labCode: record.labCode,
    sampleIdent: record.sampleIdent,
    createdAt: record.createdAt.toISOString(),
    ageDays: Math.floor((now.getTime() - record.createdAt.getTime()) / DAY_MS),
    stageKey: sample.currentStage?.key ?? null,
    stageName: sample.currentStage?.name ?? null,
    status: sample.status,
    missing: gapsOf(record),
  };
}

/**
 * Samples whose records need a person's attention: an identity with holes
 * in it, or no Ni result long after the sample was made. Oldest first,
 * because those are the ones least likely to fix themselves.
 */
export async function loadDataQuality(query: QualityQuery, now: Date = new Date()): Promise<QualityList> {
  const where = qualityWhere(query, now);
  const [identity, results, byGapCounts, total, records] = await Promise.all([
    prisma.labRecord.count({ where: qualityWhere({ ...query, check: "identity", gap: undefined }, now) }),
    prisma.labRecord.count({ where: qualityWhere({ ...query, check: "results" }, now) }),
    Promise.all(
      IDENTITY_GAPS.map((gap) =>
        prisma.labRecord.count({ where: { ...ACTIVE_SAMPLE_RELATION, ...GAP_WHERE[gap] } })
      )
    ),
    prisma.labRecord.count({ where }),
    prisma.labRecord.findMany({
      where,
      select: qualitySelect,
      orderBy: [{ createdAt: "asc" }, { labCode: "asc" }],
      skip: (query.page - 1) * QUALITY_PAGE_SIZE,
      take: QUALITY_PAGE_SIZE,
    }),
  ]);

  return {
    summary: {
      identity,
      results,
      days: query.days,
      byGap: Object.fromEntries(IDENTITY_GAPS.map((gap, index) => [gap, byGapCounts[index]])) as Record<
        IdentityGap,
        number
      >,
    },
    rows: records.map((record) => toQualityRow(record, now)),
    total,
    page: query.page,
    totalPages: Math.max(1, Math.ceil(total / QUALITY_PAGE_SIZE)),
  };
}
