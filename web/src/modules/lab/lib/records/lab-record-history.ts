import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { ACTIVE_LAB_RECORD } from "@/modules/lab/lib/samples/soft-delete";
import { RESULT_KEYS } from "@/modules/lab/lib/records/overwrite";
import { parseDayInput } from "@/core/lib/wita-time";
import { TtlCache } from "@/core/lib/ttl-cache";
import type { RecordHistoryEntry } from "@/modules/lab/types";

/**
 * Who changed which result, when, from what to what, and why -- read from the
 * audit every write already leaves behind (paste, import, the grid, a single
 * edit, a sub-sample made or removed, a result replaced on purpose).
 */

/** One sample's history is a screen, not a report: the latest this many. */
const RECORD_HISTORY_LIMIT = 200;

export const HISTORY_PAGE_SIZE = 25;

/** The master option kinds an audit stores by id. */
const OPTION_KEYS = new Set(["placeId", "rockTypeId", "nonProdId", "pitId", "sirId"]);

const historyInclude = {
  changedBy: { select: { name: true } },
  labRecord: {
    select: {
      id: true,
      labCode: true,
      sampleIdent: true,
      subCode: true,
      sample: { select: { sampleCode: true } },
      parent: { select: { sample: { select: { sampleCode: true } } } },
    },
  },
} satisfies Prisma.LabRecordAuditInclude;

type AuditRow = Prisma.LabRecordAuditGetPayload<{ include: typeof historyInclude }>;
type Change = { from: number | string | null; to: number | string | null };

/**
 * The audits as the screens show them. The audit keeps a master option by its
 * id, which tells a reader nothing, so every id is read back as its code in
 * one query -- one deleted outright stays an id, rather than the change
 * pretending not to have happened.
 */
async function toHistoryEntries(audits: AuditRow[]): Promise<RecordHistoryEntry[]> {
  const ids = [
    ...new Set(
      audits.flatMap((audit) =>
        Object.entries((audit.changes ?? {}) as Record<string, Change>).flatMap(([key, change]) =>
          OPTION_KEYS.has(key) ? [change.from, change.to].filter((value): value is string => typeof value === "string") : []
        )
      )
    ),
  ];
  const options = ids.length
    ? await prisma.masterOption.findMany({ where: { id: { in: ids } }, select: { id: true, code: true } })
    : [];
  const codeOf = new Map(options.map((option) => [option.id, option.code]));
  const readable = (key: string, value: number | string | null) =>
    OPTION_KEYS.has(key) && typeof value === "string" ? (codeOf.get(value) ?? value) : value;

  return audits.map((audit) => ({
    id: audit.id,
    changedAt: audit.changedAt.toISOString(),
    changedBy: audit.changedBy.name,
    reason: audit.reason,
    changes: Object.fromEntries(
      Object.entries((audit.changes ?? {}) as Record<string, Change>).map(([key, change]) => [
        key,
        { from: readable(key, change.from), to: readable(key, change.to) },
      ])
    ),
    record: {
      id: audit.labRecord.id,
      labCode: audit.labRecord.labCode,
      sampleIdent: audit.labRecord.sampleIdent,
      subCode: audit.labRecord.subCode,
      sampleCode: (audit.labRecord.sample ?? audit.labRecord.parent?.sample)?.sampleCode ?? null,
    },
  }));
}

/**
 * One record's history, newest first. A sample's includes its sub-samples',
 * each marked as such; a sub's is its own.
 *
 * A deleted sample's history only for those who may see deletions
 * (`includeDeleted`); to everybody else it reads as not found, as the sample
 * itself does.
 */
export async function loadRecordHistory(
  recordId: string,
  { includeDeleted = true }: { includeDeleted?: boolean } = {}
): Promise<RecordHistoryEntry[] | null> {
  const record = await prisma.labRecord.findFirst({
    where: { id: recordId, ...(includeDeleted ? {} : ACTIVE_LAB_RECORD) },
    select: { id: true, subs: { select: { id: true } } },
  });
  if (!record) return null;
  const audits = await prisma.labRecordAudit.findMany({
    where: { labRecordId: { in: [record.id, ...record.subs.map((sub) => sub.id)] } },
    include: historyInclude,
    orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    take: RECORD_HISTORY_LIMIT,
  });
  return toHistoryEntries(audits);
}

export interface HistoryQuery {
  search?: string;
  /** Days, both ends inclusive, on the lab's clock. */
  from?: string;
  to?: string;
  /** Only the changes that touch a result, not those to identity or remarks alone. */
  resultsOnly: boolean;
  page: number;
}

/** History totals by filter, for the page count under the list. */
const historyTotals = new TtlCache<{ total: bigint }[]>(15_000, 64);

/** The lab's day starts at 00:00 WITA, eight hours ahead of UTC. */
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Every change, newest first, across all records. Searched on the record's
 * own codes and its sample's (a sub's parent's), within a range of days, and
 * by default only the changes that touch a result.
 */
export async function listHistory(query: HistoryQuery): Promise<{ entries: RecordHistoryEntry[]; total: number }> {
  const conditions: Prisma.Sql[] = [];
  if (query.search) {
    const like = `%${query.search}%`;
    conditions.push(Prisma.sql`(
      r.lab_code LIKE ${like} OR r.sample_ident LIKE ${like} OR s.sample_code LIKE ${like} OR ps.sample_code LIKE ${like}
    )`);
  }
  const from = query.from ? parseDayInput(query.from) : null;
  const to = query.to ? parseDayInput(query.to) : null;
  if (from) conditions.push(Prisma.sql`a.changed_at >= ${new Date(from.getTime() - WITA_OFFSET_MS)}`);
  if (to) conditions.push(Prisma.sql`a.changed_at < ${new Date(to.getTime() + 24 * 60 * 60 * 1000 - WITA_OFFSET_MS)}`);
  if (query.resultsOnly) {
    // Any of the result columns among the changed keys. The paths come from
    // the fixed list, never from the request.
    const paths = Prisma.join(RESULT_KEYS.map((key) => Prisma.sql`${`$.${key}`}`), ", ");
    conditions.push(Prisma.sql`JSON_CONTAINS_PATH(a.changes, 'one', ${paths})`);
  }
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
  const from_ = Prisma.sql`
    FROM lab_record_audits a
    JOIN lab_records r ON r.id = a.lab_record_id
    LEFT JOIN samples s ON s.id = r.sample_id
    LEFT JOIN lab_records p ON p.id = r.parent_id
    LEFT JOIN samples ps ON ps.id = p.sample_id
  `;

  // The joins only matter to the search; every audit has its record, so
  // without one the count is the audit table's alone. Counting is still a
  // pass over every audit, so the total is shared for a few seconds across
  // everyone paging the same view rather than recounted per page.
  const countFrom = query.search ? from_ : Prisma.sql`FROM lab_record_audits a`;
  const [counted, page] = await Promise.all([
    historyTotals.get(JSON.stringify([where.sql, where.values, query.search ?? null]), () =>
      prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total ${countFrom} ${where}`
    ),
    prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id ${from_} ${where}
      ORDER BY a.changed_at DESC, a.id DESC
      LIMIT ${HISTORY_PAGE_SIZE} OFFSET ${(query.page - 1) * HISTORY_PAGE_SIZE}
    `,
  ]);
  const ids = page.map((row) => row.id);
  const audits = ids.length
    ? await prisma.labRecordAudit.findMany({ where: { id: { in: ids } }, include: historyInclude })
    : [];
  const byId = new Map(audits.map((audit) => [audit.id, audit]));
  return {
    entries: await toHistoryEntries(ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))),
    total: Number(counted[0]?.total ?? 0),
  };
}
