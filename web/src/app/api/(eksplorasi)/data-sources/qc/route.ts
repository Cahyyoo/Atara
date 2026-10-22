import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { qcChartsQuerySchema } from "@/modules/eksplorasi/validation";
import { loadQcCharts } from "@/modules/eksplorasi/lib/qc-service";

/** The dashboard's two scatter plots for one element: the standards by date, the duplicates against their originals. */
export const GET = route({ capability: "manageExplorationData", query: qcChartsQuerySchema }, async ({ query }) =>
  jsonSuccess(await loadQcCharts(query))
);
