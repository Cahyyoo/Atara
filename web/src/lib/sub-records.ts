import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { labRecordInclude, toLabRecordDTO, toLabRecordSampleSummary } from "@/lib/lab-record";
import { normalizeSampleKey, subKey, withoutSacks } from "@/lib/sample-ident";
import { ACTIVE_SAMPLE_RELATION } from "@/lib/soft-delete";

/**
 * Sub-samples: a fraction of a sample -- "LAM/SAP/S4/B24/3475.3 (-20)" --
 * assayed on its own.
 *
 * A sub is a lab record of its own that points at the record it was taken
 * from. It has no barcode and no place in the day's run of lab codes; its
 * Lab Code and Sample ID are its parent's with the code in brackets, and its
 * identity columns are copies of its parent's, kept in step, so every filter
 * and grouping that reads them works on subs without a join.
 */

/** The identity a sub copies from its parent. */
const INHERITED = {
  placeId: true,
  rockTypeId: true,
  nonProdId: true,
  pitId: true,
  sirId: true,
  bargingNo: true,
  sequenceNo: true,
  sampleNo: true,
  sackCount: true,
} as const satisfies Prisma.LabRecordSelect;

type Inherited = Prisma.LabRecordGetPayload<{ select: typeof INHERITED }>;

function inheritedOf(parent: Inherited): Inherited {
  return Object.fromEntries(Object.keys(INHERITED).map((key) => [key, parent[key as keyof Inherited]])) as Inherited;
}

/** A sub code as stored: what was in the brackets, upper-cased, spaces closed up. */
export function normalizeSubCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Creates the sub `code` under `parentId`, or finds the one already there:
 * pasting "(-20)" twice fills the same sub rather than making a second.
 */
export async function ensureSub(
  db: Prisma.TransactionClient,
  parentId: string,
  rawCode: string,
  userId: string
): Promise<{ id: string; created: boolean }> {
  const code = normalizeSubCode(rawCode);
  const existing = await db.labRecord.findUnique({
    where: { parentId_subCode: { parentId, subCode: code } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const parent = await db.labRecord.findFirst({
    // A sub is never a parent: one level only.
    where: { id: parentId, parentId: null, ...ACTIVE_SAMPLE_RELATION },
    select: { ...INHERITED, labCode: true, shiftDate: true, sampleIdent: true },
  });
  if (!parent) throw new ApiError("The sample this sub belongs to no longer exists.", 404);

  const sub = await db.labRecord.create({
    data: {
      labCode: subKey(parent.labCode, code),
      shiftDate: parent.shiftDate,
      parentId,
      subCode: code,
      ...inheritedOf(parent),
      sampleIdent: parent.sampleIdent ? subKey(parent.sampleIdent, code) : null,
      updatedById: userId,
    },
    select: { id: true },
  });
  await db.labRecordAudit.create({
    data: {
      labRecordId: sub.id,
      changedById: userId,
      changes: { subCode: { from: null, to: code } } as Prisma.InputJsonObject,
      reason: "Sub sample created",
    },
  });
  return { id: sub.id, created: true };
}

/**
 * Brings the subs of these parents back in step after a parent's identity
 * changed: the same identity columns, and the parent's Sample ID with the
 * sub's code. Their ids are cleared first, all at once, so two subs trading
 * Sample IDs never meet on the unique index halfway.
 */
export async function syncSubs(db: Prisma.TransactionClient, parentIds: readonly string[]): Promise<void> {
  if (parentIds.length === 0) return;
  const parents = await db.labRecord.findMany({
    where: { id: { in: [...parentIds] }, subs: { some: {} } },
    select: { ...INHERITED, sampleIdent: true, subs: { select: { id: true, subCode: true } } },
  });
  const subs = parents.flatMap((parent) => parent.subs);
  if (subs.length === 0) return;

  await db.labRecord.updateMany({ where: { id: { in: subs.map((sub) => sub.id) } }, data: { sampleIdent: null } });
  for (const parent of parents) {
    for (const sub of parent.subs) {
      await db.labRecord.update({
        where: { id: sub.id },
        data: {
          ...inheritedOf(parent),
          sampleIdent: parent.sampleIdent && sub.subCode ? subKey(parent.sampleIdent, sub.subCode) : null,
        },
      });
    }
  }
}

/** A parent record with its sample and its sub-samples, as a look-up needs it. */
const PARENT_INCLUDE = labRecordInclude;

type Parent = Prisma.LabRecordGetPayload<{ include: typeof PARENT_INCLUDE }>;
type Sub = Parent["subs"][number];

/** A record as the paste screen shows it; a sub with its parent's sample. */
function toResolvedItem(record: Parent | Sub, parent: Parent) {
  return { ...toLabRecordDTO(record), sample: toLabRecordSampleSummary(parent.sample!) };
}

export type KeyResolution =
  | { key: string; status: "found"; record: ReturnType<typeof toResolvedItem> }
  | { key: string; status: "newSub"; parent: ReturnType<typeof toResolvedItem>; code: string }
  /** The Sample ID fits more than one sample once its sack count is left out. */
  | { key: string; status: "ambiguous" }
  | { key: string; status: "unknown" };

/**
 * What each pasted Sample ID names, looked up across every live sample -- no
 * ticking needed.
 *
 * A key is read the way `normalizeSampleKey` reads it, so a space and a slash
 * are the same separator, and the sack count at the end may be left out:
 * "LAM SAM S2/PA4/B10/3778.1" finds "LAM/SAM/S2/PA4/B10/3778.1/25". A bracketed
 * code after it names a sub-sample of that sample -- the one already there,
 * or a new one. Where leaving the sacks out fits two samples, nothing is
 * guessed. Lab Codes are not matched on.
 */
export async function resolvePastedKeys(keys: readonly string[]): Promise<KeyResolution[]> {
  const read = keys.map((key) => ({ key, ...normalizeSampleKey(key) }));
  const bases = [...new Set(read.map((entry) => entry.base).filter(Boolean))];

  // Narrowed in the database by prefix, decided here exactly: the stored id
  // is either the base itself, or the base followed by the record's own sack
  // count -- never merely something that starts the same way.
  const candidates = bases.length
    ? await prisma.labRecord.findMany({
        where: {
          parentId: null,
          ...ACTIVE_SAMPLE_RELATION,
          OR: bases.flatMap((base) => [{ sampleIdent: base }, { sampleIdent: { startsWith: `${base}/` } }]),
        },
        include: PARENT_INCLUDE,
      })
    : [];
  const byBase = new Map<string, Parent[]>();
  for (const candidate of candidates) {
    if (!candidate.sampleIdent) continue;
    const stored = candidate.sampleIdent.toUpperCase();
    for (const base of new Set([stored, withoutSacks(stored, candidate.sackCount)])) {
      if (!bases.includes(base)) continue;
      const held = byBase.get(base) ?? [];
      if (!held.some((record) => record.id === candidate.id)) held.push(candidate);
      byBase.set(base, held);
    }
  }

  return read.map((entry): KeyResolution => {
    const matches = byBase.get(entry.base) ?? [];
    if (matches.length === 0) return { key: entry.key, status: "unknown" };
    if (matches.length > 1) return { key: entry.key, status: "ambiguous" };
    const parent = matches[0];
    if (!entry.code) return { key: entry.key, status: "found", record: toResolvedItem(parent, parent) };

    const code = normalizeSubCode(entry.code);
    const sub = parent.subs.find((candidate) => candidate.subCode === code);
    return sub
      ? { key: entry.key, status: "found", record: toResolvedItem(sub, parent) }
      : { key: entry.key, status: "newSub", parent: toResolvedItem(parent, parent), code };
  });
}
