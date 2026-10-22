import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { listCampaigns } from "@/modules/eksplorasi/lib/data-source-service";

/** The campaigns in the data source, for the lists' filter. */
export const GET = route({ capability: "manageExplorationData" }, async () => jsonSuccess(await listCampaigns()));
