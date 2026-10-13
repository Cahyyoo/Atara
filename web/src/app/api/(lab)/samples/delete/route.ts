import { invalidateAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { prisma } from "@/core/lib/prisma";
import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { deleteSamplesSchema } from "@/modules/lab/validation/samples";
import { readJsonBody } from "@/core/lib/http/api-request";

/**
 * Removes samples from view, or puts them back.
 *
 * Soft, and only ever soft. A sample is the container in front of someone,
 * its scan history and its assay results all at once; destroying that because
 * a barcode was generated twice is not a trade worth offering. The row keeps
 * its lab code and its Sample ID, so the label still on the container cannot
 * be claimed by anything else.
 *
 * Administrators only, like every other write that reaches more than one row.
 */
export const POST = route({ capability: "editDatabase" }, async ({ request, session }) => {
  const { ids, restore } = deleteSamplesSchema.parse(await readJsonBody(request));

  // Only rows that are actually in the state being asked for. Without this a
  // second click would stamp a new deletedAt over the first, moving the
  // record of when it happened.
  const targets = await prisma.sample.findMany({
    where: { id: { in: ids }, deletedAt: restore ? { not: null } : null },
    select: { id: true },
  });
  if (targets.length === 0) {
    throw new ApiError(
      restore
        ? "None of these samples are deleted."
        : "None of these samples are still present.",
      409
    );
  }

  const changed = await prisma.sample.updateMany({
    where: { id: { in: targets.map((sample) => sample.id) } },
    data: restore
      ? { deletedAt: null, deletedById: null }
      : { deletedAt: new Date(), deletedById: session.userId },
  });

  // The author of this change is about to look for it on the dashboard.
  invalidateAnalytics();
  return jsonSuccess({ changed: changed.count, submitted: ids.length });
});
