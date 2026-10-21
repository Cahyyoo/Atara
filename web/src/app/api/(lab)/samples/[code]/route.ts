import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, jsonError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { can } from "@/core/lib/auth/permissions";
import { toLabRecordDTO } from "@/modules/lab/lib/records/lab-record";
import { ACTIVE_SAMPLE } from "@/modules/lab/lib/samples/soft-delete";
import { hidesSampleIdent, visibleLabRecord, type VisibleLabRecord } from "@/modules/lab/lib/settings/ident-visibility";

/**
 * What a caller who may not read lab records still needs of one: which record
 * it is and the sample's identity -- the scan rules and the identity screen on
 * the phone turn on these. Results, weights and remarks stay with the roles
 * that hold readLabRecords.
 */
const IDENTITY_VIEW = [
  "id",
  "labCode",
  "sampleIdent",
  "placeId",
  "rockTypeId",
  "nonProdId",
  "pitId",
  "sirId",
  "bargingNo",
  "sequenceNo",
  "sampleNo",
  "sackCount",
  "hasSampleIdent",
  "identHidden",
] as const satisfies readonly (keyof VisibleLabRecord)[];

function identityView(record: VisibleLabRecord) {
  return Object.fromEntries(IDENTITY_VIEW.map((key) => [key, record[key]]));
}

export const GET = route<{ code: string }>({ capability: "viewDashboard" }, async ({ params, session }) => {
  const { code } = params;

  const sample = await prisma.sample.findFirst({
    where: {
      sampleCode: decodeURIComponent(code),
      // A deleted sample is only there for the roles that may see deletions.
      ...(can(session, "viewDeletedRecords") ? {} : ACTIVE_SAMPLE),
    },
    include: {
      currentStage: true,
      labRecord: true,
      // Names only: nothing that reads this shows an address, and a
      // preparator's phone has no business holding everybody's.
      createdBy: { select: { id: true, name: true } },
      logs: {
        orderBy: { scannedAt: "asc" },
        include: {
          stage: true,
          preparator: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!sample) {
    return jsonError("Sample not found.", 404);
  }

  // The mobile app may be kept from the Sample ID (lab settings); it is still
  // told that one exists, which is what the scan rules turn on.
  const hide = await hidesSampleIdent(session);
  const labRecord = sample.labRecord ? visibleLabRecord(toLabRecordDTO(sample.labRecord), hide) : null;
  return jsonSuccess({
    ...sample,
    labRecord: labRecord && !can(session, "readLabRecords") ? identityView(labRecord) : labRecord,
  });
});
