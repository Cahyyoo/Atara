import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, jsonError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { toLabRecordDTO } from "@/modules/lab/lib/records/lab-record";
import { hidesSampleIdent, visibleLabRecord } from "@/modules/lab/lib/settings/ident-visibility";

export const GET = route<{ code: string }>({ capability: "viewDashboard" }, async ({ params, session }) => {
  const { code } = params;

  const sample = await prisma.sample.findUnique({
    where: { sampleCode: decodeURIComponent(code) },
    include: {
      currentStage: true,
      labRecord: true,
      createdBy: { select: { id: true, name: true, email: true } },
      logs: {
        orderBy: { scannedAt: "asc" },
        include: {
          stage: true,
          preparator: { select: { id: true, name: true, email: true } },
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
  return jsonSuccess({
    ...sample,
    labRecord: sample.labRecord ? visibleLabRecord(toLabRecordDTO(sample.labRecord), hide) : null,
  });
});
