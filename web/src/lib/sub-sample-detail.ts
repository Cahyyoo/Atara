import "server-only";

import { prisma } from "@/lib/prisma";
import { ACTIVE_SAMPLE } from "@/lib/soft-delete";
import { normalizeSubCode } from "@/lib/sub-records";

/**
 * What a sub-sample's page shows: the sub itself, the sample it was taken
 * from (whose stage and status it shares -- it has no barcode or scans of its
 * own), the other subs of that sample, and the sub's own history.
 *
 * Null when the sample does not exist, was removed, or has no sub by that code.
 */
export async function loadSubSampleDetail(sampleCode: string, rawSubCode: string, historyLimit = 30) {
  const sample = await prisma.sample.findFirst({
    where: { sampleCode, ...ACTIVE_SAMPLE },
    include: {
      currentStage: true,
      labRecord: {
        include: {
          subs: { orderBy: { subCode: "asc" }, include: { updatedBy: { select: { name: true } } } },
        },
      },
    },
  });
  const subCode = normalizeSubCode(rawSubCode);
  const sub = sample?.labRecord?.subs.find((candidate) => candidate.subCode === subCode);
  if (!sample || !sample.labRecord || !sub) return null;

  const audits = await prisma.labRecordAudit.findMany({
    where: { labRecordId: sub.id },
    orderBy: { changedAt: "desc" },
    take: historyLimit,
    include: { changedBy: { select: { id: true, name: true, email: true } } },
  });

  return {
    sample,
    parent: sample.labRecord,
    sub,
    others: sample.labRecord.subs.filter((other) => other.id !== sub.id),
    audits,
  };
}
