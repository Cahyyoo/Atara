import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { loadStageBoard } from "@/modules/lab/lib/stages/stage-board";

/** The TV view's data: where every live sample is now, stage by stage. */
export const GET = route({ capability: "viewDashboard" }, async () => {
  return jsonSuccess(await loadStageBoard());
});
