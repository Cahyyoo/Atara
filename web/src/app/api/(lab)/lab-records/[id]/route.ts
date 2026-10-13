import { invalidateAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { updateDatabaseRecordSchema } from "@/modules/lab/validation/records";
import { weighingProblem } from "@/modules/lab/lib/records/mc";
import { diffLabRecord, toLabRecordDTO } from "@/modules/lab/lib/records/lab-record";
import { IDENTITY_FIELDS, resolveSampleIdent } from "@/modules/lab/lib/samples/sample-ident-server";
import { ACTIVE_LAB_RECORD } from "@/modules/lab/lib/samples/soft-delete";
import { readJsonBody } from "@/core/lib/http/api-request";
import { syncSubs } from "@/modules/lab/lib/records/sub-records";

export const PATCH = route<{ id: string }>({ capability: "editDatabase" }, async ({ request, session, params }) => {
  const { id } = params;
  const data = updateDatabaseRecordSchema.parse(await readJsonBody(request));

  // A deleted sample's record is not editable; it reads as missing,
  // which is what it is until someone restores it.
  const existing = await prisma.labRecord.findFirst({
    where: { id, ...ACTIVE_LAB_RECORD },
  });
  if (!existing) {
    throw new ApiError("Sample record not found.", 404);
  }
  // The weighing as it will stand, checked whole: a partial update can
  // still leave Wd heavier than W0.
  const weight = (key: "wp" | "w0" | "wd") =>
    data[key] !== undefined ? data[key] : existing[key] === null ? null : Number(existing[key]);
  const problem = weighingProblem(weight("wp"), weight("w0"), weight("wd"));
  if (problem) throw new ApiError(problem, 422);

  // A sub-sample's identity is its parent's, kept in step from there.
  if (existing.parentId && IDENTITY_FIELDS.some((field) => data[field] !== undefined)) {
    throw new ApiError("A sub-sample's identity follows its parent; change it on the parent sample.", 422);
  }

  const record = await prisma.$transaction(async (tx) => {
    // Rebuilt on every write that could move one of its parts: the id is
    // stored, so a corrected pit would otherwise leave the old one in it.
    const sampleIdent = await resolveSampleIdent(tx, existing, data);
    // Named rather than left to the unique index, whose refusal would say
    // only that something already exists. Identities are now filled in
    // here, after the barcodes are made, so this is where clashes surface.
    if (sampleIdent && sampleIdent !== existing.sampleIdent) {
      const holder = await tx.labRecord.findUnique({
        where: { sampleIdent },
        select: { id: true, labCode: true, sample: { select: { sampleCode: true } } },
      });
      if (holder && holder.id !== id) {
        throw new ApiError(
          `Sample ID ${sampleIdent} is already used by sample ${holder.sample?.sampleCode ?? holder.labCode}.`,
          409
        );
      }
    }
    const payload = sampleIdent === undefined ? data : { ...data, sampleIdent };

    const changes = diffLabRecord(existing, payload);
    const hasChanges = Object.keys(changes).length > 0;

    const updated = await tx.labRecord.update({
      where: { id },
      data: hasChanges ? { ...payload, updatedById: session.userId } : payload,
    });

    if (hasChanges) {
      await tx.labRecordAudit.create({
        data: {
          labRecordId: id,
          changedById: session.userId,
          changes: changes as unknown as Prisma.InputJsonObject,
        },
      });
    }
    // Its sub-samples carry its identity: they move with it.
    if (sampleIdent !== undefined) await syncSubs(tx, [id]);

    return updated;
  });

  // The author of this change is about to look for it on the dashboard.
  invalidateAnalytics();
  return jsonSuccess(toLabRecordDTO(record));
});
