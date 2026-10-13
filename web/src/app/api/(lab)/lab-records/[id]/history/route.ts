import { jsonSuccess, ApiError } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { loadRecordHistory } from "@/modules/lab/lib/records/lab-record-history";

/**
 * One record's change history, newest first -- a sample's with its
 * sub-samples', each marked as such. For whoever reads results.
 */
export const GET = route<{ id: string }>({ capability: "viewRecordHistory" }, async ({ params }) => {
  const { id } = params;
  const entries = await loadRecordHistory(id);
  if (!entries) throw new ApiError("Sample record not found.", 404);
  return jsonSuccess({ entries });
});
