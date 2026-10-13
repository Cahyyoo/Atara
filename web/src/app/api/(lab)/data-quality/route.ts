import { jsonSuccess } from "@/core/lib/http/api-response";
import { route } from "@/core/lib/http/api-route";
import { dataQualityQuerySchema } from "@/modules/lab/validation/reports";
import { loadDataQuality } from "@/modules/lab/lib/analytics/data-quality";

/**
 * Records that need somebody's attention: holes in the identity, or no
 * result long after the sample was made. For whoever keeps the sample
 * database right.
 */
export const GET = route({ capability: "viewDatabase" }, async ({ request }) => {
  const query = dataQualityQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  return jsonSuccess(await loadDataQuality(query));
});
