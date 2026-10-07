import "server-only";

import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import type { StageTransition } from "@/lib/stage-transition";

/**
 * Writes a stage move that `evaluateStageTransition` has allowed: the
 * sample's stage and status, and the log line saying who did it.
 *
 * Shared by the operator's scan and the administrator's correction on the
 * website, so both are written the same way and race the same way.
 */
export async function applyStageMove({
  sample,
  decision,
  userId,
  notes,
}: {
  sample: { id: string; currentStageId: string | null };
  decision: Extract<StageTransition, { ok: true }>;
  userId: string;
  notes: string | null;
}) {
  const { stage, isCorrection, status } = decision;
  const scannedAt = new Date();

  return prisma.$transaction(
    async (tx) => {
      // The ordering rule was decided from the stage read before this. Writing
      // only if the sample is still on that stage closes the window where two
      // concurrent moves of the same sample both go through.
      const claimed = await tx.sample.updateMany({
        where: { id: sample.id, currentStageId: sample.currentStageId },
        data: {
          currentStageId: stage.id,
          status,
          stageEnteredAt: scannedAt,
        },
      });
      if (claimed.count === 0) {
        throw new ApiError(
          "This sample was moved by another scan a moment ago. Scan it again to see where it is now.",
          409,
          // Tagged because this 409 is transient — two scans raced and one lost
          // — while every other 409 here is a real refusal of the stage order.
          // A queued scan that hits this deserves another attempt, not a
          // permanent rejection the operator has to clear by hand.
          "STAGE_MOVED"
        );
      }

      await tx.sampleLog.create({
        data: {
          sampleId: sample.id,
          stageId: stage.id,
          operatorId: userId,
          isCorrection,
          notes,
          scannedAt,
        },
      });

      return tx.sample.findUniqueOrThrow({
        where: { id: sample.id },
        include: {
          currentStage: true,
          createdBy: { select: { id: true, name: true } },
          // The operator is standing in front of the container, and the Sample
          // ID is what the lab sheet calls it. Same two columns the sample
          // lists carry, so the scan answer and a list row say the same thing.
          labRecord: { select: { labCode: true, sampleIdent: true } },
        },
      });
    },
    {
      // Explicit rather than Prisma's 2-second default: a scan that queues
      // for a connection at shift change should wait a moment, not fail at
      // once with P2028 and be shown to the operator as an error.
      maxWait: 3000,
      timeout: 8000,
    }
  );
}
