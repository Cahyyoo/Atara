import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { loadStages } from "@/modules/lab/lib/stages/stages-cache";
import { jsonSuccess, handleApiError, ApiError } from "@/core/lib/http/api-response";
import { requireCapability } from "@/core/lib/http/api-auth";
import { scanSampleSchema } from "@/modules/lab/validation/samples";
import { SAMPLE_IDENT_REQUIRED, evaluateStageTransition } from "@/modules/lab/lib/stages/stage-transition";
import { readJsonBody, BODY_LIMIT } from "@/core/lib/http/api-request";
import { applyStageMove } from "@/modules/lab/lib/stages/stage-move";
import { hidesSampleIdent, visibleIdent } from "@/modules/lab/lib/settings/ident-visibility";

export async function POST(request: NextRequest) {
  try {
    // The preparator is whoever holds the token — never whoever the body claims.
    // Moving samples between stages is the preparator's job alone; the other
    // roles work on the website.
    const session = await requireCapability(request, "scanSamples");
    const body = scanSampleSchema.parse(await readJsonBody(request, BODY_LIMIT.scan));

    // Neither read depends on the other, so they go together.
    const [sample, stages] = await Promise.all([
      prisma.sample.findUnique({
        where: { sampleCode: body.sample_code },
        include: { currentStage: true, labRecord: { select: { sampleIdent: true } } },
      }),
      loadStages(),
    ]);
    if (!sample) {
      throw new ApiError("Sample Not Registered", 404);
    }
    // Named for what it is. The label is still on the container, so the
    // preparator will scan it again and again unless the answer says why.
    if (sample.deletedAt !== null) {
      throw new ApiError("This sample was removed from the database.", 410);
    }
    // Filled in first, then moved: the app opens the identity form for exactly
    // this, and the check here holds for older builds and queued scans too.
    if (!sample.labRecord?.sampleIdent) {
      throw new ApiError(
        "This sample has no Sample ID yet. Fill it in before moving it to a stage.",
        422,
        SAMPLE_IDENT_REQUIRED
      );
    }

    const decision = evaluateStageTransition({
      stages,
      currentOrder: sample.currentStage?.sequenceOrder ?? 0,
      targetStageId: body.stage_id,
      role: session.role,
      force: body.force,
      reason: body.reason,
    });

    if (!decision.ok) {
      throw new ApiError(decision.message, decision.httpStatus, decision.code);
    }

    const updatedSample = await applyStageMove({
      sample,
      decision,
      userId: session.userId,
      notes: decision.isCorrection ? body.reason! : (body.notes ?? null),
    });

    const hide = await hidesSampleIdent(session);
    return jsonSuccess({
      ...updatedSample,
      labRecord: updatedSample.labRecord ? visibleIdent(updatedSample.labRecord, hide) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
