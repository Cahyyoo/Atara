import type { NextRequest } from "next/server";
import { loadStages } from "@/lib/stages-cache";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "viewDashboard");

    const stages = await loadStages();

    // The workflow definition changes about never, but several screens fetch it
    // on mount. `private` keeps it out of any shared cache.
    const response = jsonSuccess(stages);
    response.headers.set("Cache-Control", "private, max-age=30");
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
