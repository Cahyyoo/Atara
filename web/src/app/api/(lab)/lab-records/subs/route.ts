import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { invalidateAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { can } from "@/core/lib/auth/permissions";
import { readJsonBody } from "@/core/lib/http/api-request";
import { ACTIVE_LAB_RECORD } from "@/modules/lab/lib/samples/soft-delete";

const deleteSubsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(200),
});

/**
 * Removes sub-samples -- a fraction entered by mistake, or under the wrong
 * code. Whoever enters results made them, and whoever keeps the database can
 * tidy them; a sample itself is never removed here. A sub has no barcode or
 * scan history of its own, so it is deleted outright; the removal is written
 * into its parent's history.
 */
export const DELETE = route({}, async ({ request, session }) => {
  if (!can(session, "enterResults") && !can(session, "editDatabase")) {
    throw new ApiError("Your role does not allow this action.", 403);
  }
  const { ids } = deleteSubsSchema.parse(await readJsonBody(request));

  const subs = await prisma.labRecord.findMany({
    where: { id: { in: ids }, parentId: { not: null }, ...ACTIVE_LAB_RECORD },
    select: { id: true, parentId: true, subCode: true, labCode: true },
  });
  if (subs.length !== new Set(ids).size) {
    throw new ApiError("Only sub-samples can be removed here, and some of these are not.", 422);
  }

  await prisma.$transaction([
    prisma.labRecordAudit.createMany({
      data: subs.map((sub) => ({
        labRecordId: sub.parentId!,
        changedById: session.userId,
        changes: { sub: { from: sub.labCode, to: null } } as Prisma.InputJsonObject,
        reason: `Sub sample (${sub.subCode}) removed`,
      })),
    }),
    prisma.labRecord.deleteMany({ where: { id: { in: subs.map((sub) => sub.id) } } }),
  ]);

  invalidateAnalytics();
  return jsonSuccess({ removed: subs.length });
});
