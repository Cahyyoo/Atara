import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { bulkIdentitySchema } from "@/lib/validation";
import { readJsonBody } from "@/lib/api-request";
import { applyBulkIdentity } from "@/lib/bulk-identity";
import { invalidateAnalytics } from "@/lib/analytics-cache";

/**
 * The Database role filling in the identity of several records at once, after
 * their barcodes were made -- in groups, each with its own change, applied
 * together. `dryRun: true` answers with the Sample IDs it
 * would produce, and any clashes, without changing anything.
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireCapability(request, "editDatabase");
    const body = bulkIdentitySchema.parse(await readJsonBody(request));

    const result = await applyBulkIdentity({ ...body, userId: session.userId });
    if (!body.dryRun && result.updated > 0) invalidateAnalytics();
    return jsonSuccess(result);
  } catch (error) {
    return handleApiError(error);
  }
}
