import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { dataQualityQuerySchema } from "@/lib/validation";
import { loadDataQuality } from "@/lib/data-quality";

/**
 * Records that need somebody's attention: holes in the identity, or no
 * result long after the sample was made. For whoever keeps the sample
 * database right.
 */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "viewDatabase");
    const query = dataQualityQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    return jsonSuccess(await loadDataQuality(query));
  } catch (error) {
    return handleApiError(error);
  }
}
