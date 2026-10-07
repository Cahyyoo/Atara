import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { loadRecordHistory } from "@/lib/lab-record-history";

/**
 * One record's change history, newest first -- a sample's with its
 * sub-samples', each marked as such. For whoever reads results.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCapability(request, "viewRecordHistory");
    const { id } = await params;
    const entries = await loadRecordHistory(id);
    if (!entries) throw new ApiError("Sample record not found.", 404);
    return jsonSuccess({ entries });
  } catch (error) {
    return handleApiError(error);
  }
}
