import { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireSession } from "@/lib/api-auth";
import { analyticsQuerySchema } from "@/lib/validation";
import { cachedAnalytics } from "@/lib/analytics-cache";
import { resolveAnalyticsRange } from "@/lib/analytics-range";

export async function GET(request: NextRequest) {
  try {
    await requireSession(request);

    const { searchParams } = new URL(request.url);
    const query = analyticsQuerySchema.parse(Object.fromEntries(searchParams));

    const { from, to, ...identity } = query;
    const range = resolveAnalyticsRange(from, to);
    return jsonSuccess(await cachedAnalytics(range.from, range.to, identity));
  } catch (error) {
    return handleApiError(error);
  }
}
