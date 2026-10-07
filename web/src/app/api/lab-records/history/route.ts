import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { historyQuerySchema } from "@/lib/validation";
import { HISTORY_PAGE_SIZE, listHistory } from "@/lib/lab-record-history";

/**
 * Every change to the results, newest first, across all records: searched by
 * Sample ID, Lab Code or barcode, within a range of days, and by default only
 * the changes that touch a result.
 */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "viewRecordHistory");
    const query = historyQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { entries, total } = await listHistory({
      search: query.search || undefined,
      from: query.from,
      to: query.to,
      resultsOnly: query.changes === "results",
      page: query.page,
    });
    return jsonSuccess({
      entries,
      pagination: {
        page: query.page,
        pageSize: HISTORY_PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
