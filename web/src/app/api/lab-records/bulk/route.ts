import { NextRequest } from "next/server";
import { invalidateAnalytics } from "@/lib/analytics-cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { bulkUpdateLabRecordsSchema } from "@/lib/validation";
import { diffLabRecord, labRecordValueSelect, type LabRecordValues } from "@/lib/lab-record";
import { IDENTITY_FIELDS, resolveSampleIdent } from "@/lib/sample-ident-server";
import { ACTIVE_LAB_RECORD, ACTIVE_SAMPLE_RELATION } from "@/lib/soft-delete";
import { readJsonBody, BODY_LIMIT } from "@/lib/api-request";
import { ensureSub, normalizeSubCode, syncSubs } from "@/lib/sub-records";
import { findOverwrites, type Overwrite } from "@/lib/overwrite";

type UpdateValues = Record<string, unknown>;

function touchesIdentity(values: UpdateValues): boolean {
  return IDENTITY_FIELDS.some((field) => values[field] !== undefined);
}

const valueSelect = { ...labRecordValueSelect, labCode: true, parentId: true } satisfies Prisma.LabRecordSelect;
type Existing = LabRecordValues & { labCode: string; parentId: string | null };

/** A row of the request, its record (if it exists yet) and the values to write. */
interface Planned {
  record: Existing | null;
  /** For a sub-sample still to be created. */
  sub: { parentId: string; code: string } | null;
  values: UpdateValues;
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireCapability(request, "enterResults");
    const body = bulkUpdateLabRecordsSchema.parse(await readJsonBody(request, BODY_LIMIT.bulk));

    /** The values a row writes: everything but what names its record. */
    const strip = (record: (typeof body.records)[number]): UpdateValues => {
      const values: UpdateValues = { ...record };
      delete values.id;
      delete values.parentId;
      delete values.subCode;
      return values;
    };

    // Rows naming a record by id.
    const ids = body.records.flatMap((record) => (record.id ? [record.id] : []));
    const existing = ids.length
      ? await prisma.labRecord.findMany({
          // A deleted row is simply not there to be written to; it falls into
          // the `missing` branch below and is reported by id like any unknown one.
          where: { id: { in: ids }, ...ACTIVE_LAB_RECORD },
          select: valueSelect,
        })
      : [];
    const byId = new Map<string, Existing>(existing.map((record) => [record.id, record]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new ApiError(`${missing.length} record(s) in this save no longer exist.`, 404);
    }

    // Rows naming a sub-sample by its parent and code: filled if it is already
    // there, created otherwise.
    const subRows = body.records.flatMap((record) =>
      !record.id && record.parentId && record.subCode
        ? [{ parentId: record.parentId, code: normalizeSubCode(record.subCode), values: strip(record) }]
        : []
    );
    const knownSubs = subRows.length
      ? await prisma.labRecord.findMany({
          where: { OR: subRows.map((row) => ({ parentId: row.parentId, subCode: row.code })) },
          select: { ...valueSelect, subCode: true },
        })
      : [];
    const parentIds = [...new Set(subRows.map((row) => row.parentId))];
    const parents = parentIds.length
      ? await prisma.labRecord.findMany({
          where: { id: { in: parentIds }, parentId: null, ...ACTIVE_SAMPLE_RELATION },
          select: { id: true },
        })
      : [];
    if (parents.length !== parentIds.length) {
      throw new ApiError("A sample a sub-sample belongs to no longer exists.", 404);
    }

    const planned: Planned[] = [
      ...body.records.flatMap((record) =>
        record.id ? [{ record: byId.get(record.id)!, sub: null, values: strip(record) }] : []
      ),
      ...subRows.map((row) => {
        const known = knownSubs.find((sub) => sub.parentId === row.parentId && sub.subCode === row.code);
        return known
          ? { record: known as Existing, sub: null, values: row.values }
          : { record: null, sub: { parentId: row.parentId, code: row.code }, values: row.values };
      }),
    ];

    // A sub-sample's identity is its parent's, kept in step; it is changed
    // there, not on the sub.
    if (planned.some((entry) => (entry.sub || entry.record?.parentId) && touchesIdentity(entry.values))) {
      throw new ApiError("A sub-sample's identity follows its parent; change it on the parent sample.", 422);
    }

    // Replacing a result that is already there is a decision, not a side
    // effect of a paste: it needs the request to say so.
    const overwrites = planned.flatMap((entry) => {
      if (!entry.record) return [];
      const fields = findOverwrites(entry.record as unknown as Record<string, unknown>, entry.values);
      return fields.length
        ? [{ id: entry.record.id, labCode: entry.record.labCode, sampleIdent: entry.record.sampleIdent, fields }]
        : [];
    });
    if (overwrites.length > 0 && !body.overwrite) {
      throw new ApiError(
        `${overwrites.length} record(s) already have results that this save would replace.`,
        409,
        "overwrite",
        { overwrites } satisfies { overwrites: { id: string; fields: Overwrite[] }[] }
      );
    }
    const replacing = new Set(overwrites.map((entry) => entry.id));
    const reasonFor = (id: string) =>
      body.reason ?? (replacing.has(id) ? "Overwrote earlier results" : null);

    // Pasting results never moves an identity column, so this is normally empty
    // and costs nothing. When a bulk edit does move one, the Sample ID has to be
    // rebuilt from the merged row — leaving it stale would keep the old pit
    // sitting inside the very value the next paste matches its rows on.
    for (const entry of planned) {
      if (!entry.record || !touchesIdentity(entry.values)) continue;
      const sampleIdent = await resolveSampleIdent(prisma, entry.record, entry.values);
      if (sampleIdent !== undefined) entry.values = { ...entry.values, sampleIdent };
    }

    // The diff decides what is worth writing, so it is computed once, up front.
    const changed = planned.flatMap((entry) => {
      if (!entry.record) return [];
      const changes = diffLabRecord(entry.record, entry.values as Parameters<typeof diffLabRecord>[1]);
      return Object.keys(changes).length === 0 ? [] : [{ id: entry.record.id, values: entry.values, changes }];
    });
    const toCreate = planned.filter((entry) => entry.sub !== null);
    const identityMoved = changed.filter((entry) => entry.values.sampleIdent !== undefined).map((entry) => entry.id);

    let created = 0;
    if (changed.length > 0 || toCreate.length > 0) {
      // Everything lands together: one bad row cancels the whole save.
      await prisma.$transaction(
        async (tx) => {
          for (const entry of toCreate) {
            const sub = await ensureSub(tx, entry.sub!.parentId, entry.sub!.code, session.userId);
            if (sub.created) created += 1;
            const fresh = await tx.labRecord.findUniqueOrThrow({ where: { id: sub.id }, select: labRecordValueSelect });
            const changes = diffLabRecord(fresh, entry.values as Parameters<typeof diffLabRecord>[1]);
            if (Object.keys(changes).length === 0) continue;
            await tx.labRecord.update({
              where: { id: sub.id },
              data: { ...(entry.values as Prisma.LabRecordUncheckedUpdateInput), updatedById: session.userId },
            });
            await tx.labRecordAudit.create({
              data: {
                labRecordId: sub.id,
                changedById: session.userId,
                changes: changes as unknown as Prisma.InputJsonObject,
                reason: body.reason ?? null,
              },
            });
          }

          for (const entry of changed) {
            await tx.labRecord.update({
              where: { id: entry.id },
              data: { ...(entry.values as Prisma.LabRecordUncheckedUpdateInput), updatedById: session.userId },
            });
          }
          if (changed.length > 0) {
            await tx.labRecordAudit.createMany({
              data: changed.map((entry) => ({
                labRecordId: entry.id,
                changedById: session.userId,
                changes: entry.changes as unknown as Prisma.InputJsonObject,
                reason: reasonFor(entry.id),
              })),
            });
          }

          // A parent whose identity moved takes its subs with it.
          await syncSubs(tx, identityMoved);
        },
        { timeout: 30_000 }
      );
    }

    // The author of this change is about to look for it on the dashboard.
    invalidateAnalytics();
    return jsonSuccess({ updated: changed.length + toCreate.length, created, submitted: body.records.length });
  } catch (error) {
    return handleApiError(error);
  }
}
