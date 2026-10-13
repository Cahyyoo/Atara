import { loadStages } from "@/modules/lab/lib/stages/stages-cache";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";

export const GET = route({ capability: "viewDashboard" }, async () => {
  const stages = await loadStages();

  // The workflow definition changes about never, but several screens fetch it
  // on mount. `private` keeps it out of any shared cache.
  const response = jsonSuccess(stages);
  response.headers.set("Cache-Control", "private, max-age=30");
  return response;
});
