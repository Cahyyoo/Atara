import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { qcControlQuerySchema } from "@/modules/eksplorasi/validation";
import { loadStandardControl } from "@/modules/eksplorasi/lib/qc-control-service";

/** One OREAS standard's control charts: its assays by sample index, against ±1σ/2σ/3σ from the CRM List. */
export const GET = route({ capability: "manageExplorationData", query: qcControlQuerySchema }, async ({ query }) =>
  jsonSuccess(await loadStandardControl(query))
);
