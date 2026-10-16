import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { readJsonBody } from "@/core/lib/http/api-request";
import { updateSampleIdentitySchema } from "@/modules/lab/validation/samples";
import { diffLabRecord, toLabRecordDTO } from "@/modules/lab/lib/records/lab-record";
import {
  findIdentHolder,
  identTakenMessage,
  resolveSampleIdent,
} from "@/modules/lab/lib/samples/sample-ident-server";
import { ACTIVE_SAMPLE } from "@/modules/lab/lib/samples/soft-delete";
import { syncSubs } from "@/modules/lab/lib/records/sub-records";
import { invalidateAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";

/**
 * The identity as it stands, for the form that fills it in. Always whole: the
 * lab admin may keep Sample IDs off the mobile app, but whoever is filling one
 * in is shown what they are filling in.
 */
export const GET = route<{ code: string }>({ capability: "editSampleIdentity" }, async ({ params }) => {
  const sample = await prisma.sample.findFirst({
    where: { sampleCode: decodeURIComponent(params.code), ...ACTIVE_SAMPLE },
    select: { sampleCode: true, labRecord: true },
  });
  if (!sample?.labRecord) {
    throw new ApiError("Sample not found.", 404);
  }
  return jsonSuccess({
    sampleCode: sample.sampleCode,
    sampleIdent: sample.labRecord.sampleIdent,
    labRecord: toLabRecordDTO(sample.labRecord),
  });
});

/**
 * A sample's identity -- and so its Sample ID -- filled in or corrected by
 * barcode, the way the preparator does it from the mobile app with the bag in
 * hand. The same rules as the record dialog on the website: the id is
 * recomposed from the parts, a clash names the sample that already holds it,
 * and every change is audited.
 *
 * `dryRun` answers what the id would become and whether it is free, so the
 * form can warn while it is being filled in; nothing is written.
 */
export const PATCH = route<{ code: string }>(
  { capability: "editSampleIdentity" },
  async ({ request, session, params }) => {
    const { dryRun, ...identity } = updateSampleIdentitySchema.parse(await readJsonBody(request));

    const sample = await prisma.sample.findFirst({
      where: { sampleCode: decodeURIComponent(params.code), ...ACTIVE_SAMPLE },
      select: { labRecord: true },
    });
    const existing = sample?.labRecord;
    if (!existing) {
      throw new ApiError("Sample not found.", 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const sampleIdent = await resolveSampleIdent(tx, existing, identity);
      const next = sampleIdent === undefined ? existing.sampleIdent : sampleIdent;
      const clash =
        next && next !== existing.sampleIdent ? await findIdentHolder(tx, next, existing.id) : null;

      const payload = sampleIdent === undefined ? identity : { ...identity, sampleIdent };
      const changes = diffLabRecord(existing, payload);
      const changed = Object.keys(changes).length > 0;

      if (dryRun) return { record: existing, sampleIdent: next, changed, clash };
      if (clash) throw new ApiError(identTakenMessage(next!, clash), 409);
      if (!changed) return { record: existing, sampleIdent: next, changed, clash };

      const record = await tx.labRecord.update({
        where: { id: existing.id },
        data: { ...payload, updatedById: session.userId },
      });
      await tx.labRecordAudit.create({
        data: {
          labRecordId: existing.id,
          changedById: session.userId,
          changes: changes as unknown as Prisma.InputJsonObject,
        },
      });
      // Its sub-samples carry its identity: they move with it.
      if (sampleIdent !== undefined) await syncSubs(tx, [existing.id]);

      return { record, sampleIdent: record.sampleIdent, changed, clash: null };
    });

    // The preparator's change shows on the dashboard straight away.
    if (result.changed && !dryRun) invalidateAnalytics();
    return jsonSuccess({
      sampleIdent: result.sampleIdent,
      changed: result.changed,
      clash: result.clash,
      labRecord: toLabRecordDTO(result.record),
    });
  }
);
