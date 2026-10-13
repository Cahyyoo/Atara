import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { analyticsQuerySchema } from "@/modules/lab/validation/reports";
import { cachedAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { resolveAnalyticsRange } from "@/modules/lab/lib/analytics/analytics-range";

export const GET = route({ capability: "viewDashboard" }, async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const query = analyticsQuerySchema.parse(Object.fromEntries(searchParams));

  const { from, to, ...identity } = query;
  const range = resolveAnalyticsRange(from, to);
  return jsonSuccess(await cachedAnalytics(range.from, range.to, identity));
});
