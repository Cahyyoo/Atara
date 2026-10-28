import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { sampleIdSearchQuerySchema } from "@/modules/eksplorasi/validation";
import { searchFieldSampleIds } from "@/modules/eksplorasi/lib/data-source-service";

/** The FIELD samples' Sample IDs holding the search: the Duplicate list's Remarks dropdown. */
export const GET = route({ capability: "manageExplorationData", query: sampleIdSearchQuerySchema }, async ({ query }) =>
  jsonSuccess(await searchFieldSampleIds(query))
);
