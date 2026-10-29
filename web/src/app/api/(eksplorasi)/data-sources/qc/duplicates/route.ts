import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { qcDuplicateQuerySchema } from "@/modules/eksplorasi/validation";
import { loadDuplicateCharts } from "@/modules/eksplorasi/lib/qc-duplicate-service";

/** Every duplicate of one campaign and month (or all) against the FIELD sample its Remarks names. */
export const GET = route({ capability: "manageExplorationData", query: qcDuplicateQuerySchema }, async ({ query }) =>
  jsonSuccess(await loadDuplicateCharts(query))
);
