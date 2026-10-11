import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadStages } from "@/lib/stages-cache";
import { jsonSuccess, handleApiError, ApiError } from "@/lib/api-response";
import { requireCapability } from "@/lib/api-auth";
import { correctStageSchema } from "@/lib/validation";
import { evaluateStageTransition } from "@/lib/stage-transition";
import { readJsonBody } from "@/lib/api-request";
import { applyStageMove } from "@/lib/stage-move";
import { invalidateAnalytics } from "@/lib/analytics-cache";

/**
 * An administrator putting a sample on the stage it should be on, from its
 * page on the website: back, forward, or past a stage, always with a reason.
 *
 * Always a correction, so it is logged and shown as one on the timeline and
 * in the activity trail, under the administrator's name. Written by the same
 * code as a scan, so a correction racing a scan loses or wins the same way.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await requireCapability(request, "correctStage");
    const { code } = await params;
    const body = correctStageSchema.parse(await readJsonBody(request));

    const [sample, stages] = await Promise.all([
      prisma.sample.findUnique({
        where: { sampleCode: decodeURIComponent(code) },
        include: { currentStage: true },
      }),
      loadStages(),
    ]);
    if (!sample) {
      throw new ApiError("Sample not found.", 404);
    }
    if (sample.deletedAt !== null) {
      throw new ApiError("This sample was removed from the database.", 410);
    }
    if (sample.currentStageId === body.stageId) {
      throw new ApiError("The sample is already on that stage.", 409);
    }

    const decision = evaluateStageTransition({
      stages,
      currentOrder: sample.currentStage?.sequenceOrder ?? 0,
      targetStageId: body.stageId,
      role: session.role,
      force: true,
      canOverride: true,
      reason: body.reason,
    });
    if (!decision.ok) {
      throw new ApiError(decision.message, decision.httpStatus, decision.code);
    }

    const updated = await applyStageMove({
      sample,
      decision,
      userId: session.userId,
      notes: body.reason,
    });

    // The administrator is about to look for the change on the dashboard.
    invalidateAnalytics();
    return jsonSuccess(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
