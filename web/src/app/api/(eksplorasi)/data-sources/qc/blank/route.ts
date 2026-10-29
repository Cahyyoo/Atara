import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { qcBlankQuerySchema } from "@/modules/eksplorasi/validation";
import { loadBlankCharts } from "@/modules/eksplorasi/lib/qc-blank-service";

/** The blanks of one campaign (or all) by sample index, against the CRM List's Preferred Value. */
export const GET = route({ capability: "manageExplorationData", query: qcBlankQuerySchema }, async ({ query }) =>
  jsonSuccess(await loadBlankCharts(query))
);
