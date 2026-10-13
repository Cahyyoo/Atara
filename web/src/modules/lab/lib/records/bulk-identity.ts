import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { ApiError } from "@/core/lib/http/api-response";
import { ACTIVE_SAMPLE_RELATION } from "@/modules/lab/lib/samples/soft-delete";
import { diffLabRecord, labRecordValueSelect } from "@/modules/lab/lib/records/lab-record";
import { duplicateIdents } from "@/modules/lab/lib/samples/sample-ident";
import { composeWithCodes, optionCodes, type IdentityInput } from "@/modules/lab/lib/samples/sample-ident-server";
import { syncSubs } from "@/modules/lab/lib/records/sub-records";
import { IDENTITY_KEYS } from "@/modules/lab/validation/samples";

/** How many before/after pairs the preview lists. */
const PREVIEW = 10;

/** Records given one and the same change. */
export interface BulkIdentityGroup {
  ids: string[];
  set: IdentityInput;
  /** Columns to empty on every record. */
  clear?: readonly (keyof IdentityInput)[];
  sampleNoStart?: number | null;
}

export interface BulkIdentityRequest {
  /** Each with its own change, applied together. */
  groups: BulkIdentityGroup[];
  dryRun?: boolean;
  userId: string;
}

export interface BulkIdentityResult {
  updated: number;
  preview: { sampleCode: string; labCode: string; from: string | null; to: string | null }[];
  /** How many records the preview did not list. */
  more: number;
  /** Of all the records asked about, how many this would actually change. */
  changed: number;
  /** New Sample IDs repeated within the batch or already used by another record. */
  clashes: string[];
}

/**
 * Fills in, or changes, the identity of many records at once -- barcodes are
 * made first and identified afterwards, often a whole batch from the same
 * place and pit, and a batch entered under the wrong pit is put right the
 * same way.
 *
 * Records come in groups, each with its own change -- one per Sample ID in
 * the dialog -- and all of them are applied together. Within a group only
 * what is set or cleared is touched; every other part of each record stays
 * as it is. With `sampleNoStart` a group's samples are numbered in the order
 * given.
 * Each record's Sample ID is composed again, a clash with another record (or
 * within the batch, across groups too) stops the whole thing, and every
 * change goes into the record's history.
 */
export async function applyBulkIdentity(request: BulkIdentityRequest): Promise<BulkIdentityResult> {
  const allIds = request.groups.flatMap((group) => group.ids);
  const records = await prisma.labRecord.findMany({
    // Parent records only: a sub-sample's identity follows its parent's.
    where: { id: { in: allIds }, parentId: null, ...ACTIVE_SAMPLE_RELATION },
    select: { ...labRecordValueSelect, id: true, labCode: true, sample: { select: { sampleCode: true } } },
  });
  if (records.length !== new Set(allIds).size) {
    throw new ApiError("Some of these records no longer exist, or were removed.", 404);
  }
  const byId = new Map(records.map((record) => [record.id, record]));

  const merged = request.groups.flatMap((group) => {
    const set = Object.fromEntries(
      IDENTITY_KEYS.flatMap((key) => {
        const value = group.set[key];
        return value === undefined || value === null || value === "" ? [] : [[key, value]];
      })
    ) as IdentityInput;
    // In the order the ids were given, which is the order sample numbers run in.
    return [...new Set(group.ids)].map((id, index) => {
      const record = byId.get(id)!;
      const identity: IdentityInput = { ...set };
      for (const key of group.clear ?? []) identity[key] = null;
      if (group.sampleNoStart !== undefined && group.sampleNoStart !== null) {
        identity.sampleNo = group.sampleNoStart + index;
      }
      const next = Object.fromEntries(
        IDENTITY_KEYS.map((key) => [key, identity[key] !== undefined ? identity[key] : record[key]])
      ) as IdentityInput;
      return { record, update: identity, next };
    });
  });

  const codes = await optionCodes(prisma, merged.map((entry) => entry.next));
  const plans = merged.map((entry) => ({ ...entry, sampleIdent: composeWithCodes(entry.next, codes) }));

  const wanted = plans.map((plan) => plan.sampleIdent).filter((ident): ident is string => ident !== null);
  const taken = wanted.length
    ? await prisma.labRecord.findMany({
        where: { sampleIdent: { in: wanted }, id: { notIn: plans.map((plan) => plan.record.id) } },
        select: { sampleIdent: true },
      })
    : [];
  const clashes = [
    ...new Set([
      ...taken.map((row) => row.sampleIdent!),
      ...duplicateIdents(plans.map((plan) => plan.sampleIdent)),
    ]),
  ].sort();

  const isChanged = (plan: (typeof plans)[number]) =>
    Object.keys(diffLabRecord(plan.record, { ...plan.update, sampleIdent: plan.sampleIdent })).length > 0;
  const changed = plans.filter(isChanged).length;
  // The records that change first, so one change among many untouched
  // records is not left off the list.
  const listed = [...plans.filter(isChanged), ...plans.filter((plan) => !isChanged(plan))];
  const preview = listed.slice(0, PREVIEW).map((plan) => ({
    sampleCode: plan.record.sample?.sampleCode ?? plan.record.labCode,
    labCode: plan.record.labCode,
    from: plan.record.sampleIdent,
    to: plan.sampleIdent,
  }));
  const summary = { preview, more: Math.max(0, plans.length - PREVIEW), clashes, changed };

  if (request.dryRun) return { updated: 0, ...summary };
  if (clashes.length > 0) {
    throw new ApiError(
      `These Sample IDs would be used twice: ${clashes.join(", ")}. Nothing was changed.`,
      409,
      undefined,
      { clashes }
    );
  }

  let updated = 0;
  await prisma.$transaction(
    async (tx) => {
      // Ids first, all cleared, so no record is given a Sample ID another one
      // in this batch still holds until a moment later.
      const moving = plans.filter((plan) => plan.sampleIdent !== plan.record.sampleIdent);
      if (moving.length > 0) {
        await tx.labRecord.updateMany({
          where: { id: { in: moving.map((plan) => plan.record.id) } },
          data: { sampleIdent: null },
        });
      }
      const audits: Prisma.LabRecordAuditCreateManyInput[] = [];
      for (const plan of plans) {
        const payload = { ...plan.update, sampleIdent: plan.sampleIdent };
        const changes = diffLabRecord(plan.record, payload);
        if (Object.keys(changes).length === 0) continue;
        await tx.labRecord.update({
          where: { id: plan.record.id },
          data: { ...payload, updatedById: request.userId },
        });
        audits.push({
          labRecordId: plan.record.id,
          changedById: request.userId,
          changes: changes as unknown as Prisma.InputJsonObject,
          reason: "Identity changed for several records at once",
        });
      }
      // The history in one write rather than one per record: two hundred
      // fewer round trips when a whole page of barcodes is filled in.
      if (audits.length > 0) await tx.labRecordAudit.createMany({ data: audits });
      // Their sub-samples carry the same identity, and move with it.
      await syncSubs(
        tx,
        audits.map((audit) => audit.labRecordId)
      );
      updated = audits.length;
    },
    { timeout: 30_000 }
  );

  return { updated, ...summary };
}
