import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { loadYtdProduction } from "@/modules/lab/lib/analytics/ytd-production";

/** The TV view's year so far: samples and average grades per place and production code. */
export const GET = route({ capability: "viewDashboard" }, async () => {
  return jsonSuccess(await loadYtdProduction());
});
