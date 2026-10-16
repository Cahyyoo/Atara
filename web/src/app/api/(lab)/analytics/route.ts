import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { analyticsQuerySchema } from "@/modules/lab/validation/reports";
import { cachedAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { resolveAnalyticsRange } from "@/modules/lab/lib/analytics/analytics-range";
import { hidesSampleIdent, visibleIdent } from "@/modules/lab/lib/settings/ident-visibility";

export const GET = route({ capability: "viewDashboard" }, async ({ request, session }) => {
  const { searchParams } = new URL(request.url);
  const query = analyticsQuerySchema.parse(Object.fromEntries(searchParams));

  const { from, to, ...identity } = query;
  const range = resolveAnalyticsRange(from, to);
  const [analytics, hide] = await Promise.all([
    cachedAnalytics(range.from, range.to, identity),
    hidesSampleIdent(session),
  ]);
  if (!hide) return jsonSuccess(analytics);
  return jsonSuccess({
    ...analytics,
    overdueSamples: analytics.overdueSamples.map((sample) => visibleIdent(sample, hide)),
  });
});
