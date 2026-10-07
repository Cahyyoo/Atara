import type { NextRequest } from "next/server";
import { jsonSuccess, handleApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { loadStageBoard } from "@/lib/stage-board";

/** The TV view's data: where every live sample is now, stage by stage. */
export async function GET(request: NextRequest) {
  try {
    await requireCapability(request, "viewDashboard");
    return jsonSuccess(await loadStageBoard());
  } catch (error) {
    return handleApiError(error);
  }
}
