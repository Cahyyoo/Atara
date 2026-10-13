import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { bulkIdentitySchema } from "@/modules/lab/validation/samples";
import { readJsonBody } from "@/core/lib/http/api-request";
import { applyBulkIdentity } from "@/modules/lab/lib/records/bulk-identity";
import { invalidateAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";

/**
 * The Database role filling in the identity of several records at once, after
 * their barcodes were made -- in groups, each with its own change, applied
 * together. `dryRun: true` answers with the Sample IDs it
 * would produce, and any clashes, without changing anything.
 */
export const PATCH = route({ capability: "editDatabase" }, async ({ request, session }) => {
  const body = bulkIdentitySchema.parse(await readJsonBody(request));

  const result = await applyBulkIdentity({ ...body, userId: session.userId });
  if (!body.dryRun && result.updated > 0) invalidateAnalytics();
  return jsonSuccess(result);
});
