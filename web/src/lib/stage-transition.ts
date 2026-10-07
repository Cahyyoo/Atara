import type { SampleStatus } from "@/types";
import { can, type Role } from "@/lib/permissions";

export interface StageLike {
  id: string;
  name: string;
  sequenceOrder: number;
}

export type StageTransition =
  | { ok: true; stage: StageLike; isCorrection: boolean; status: SampleStatus }
  | { ok: false; httpStatus: number; message: string };

export interface StageTransitionInput {
  /** All stages, ordered by sequenceOrder ascending. */
  stages: StageLike[];
  /** sequenceOrder of the sample's current stage; 0 when it has not entered one. */
  currentOrder: number;
  targetStageId: string;
  role: Role;
  /** Roles with `overrideStage` only (operators): skip the ordering rules. */
  force?: boolean;
  reason?: string | null;
  /**
   * Whether `force` is honoured. Defaults to the role's `overrideStage`; the
   * website's stage correction passes true, having already checked
   * `correctStage` itself.
   */
  canOverride?: boolean;
}

/**
 * Decides whether a scan may move a sample to a stage.
 *
 * Pure on purpose: the scan endpoint owns the database writes, this owns the
 * rules, and the rules can be tested without a server.
 */
export function evaluateStageTransition(input: StageTransitionInput): StageTransition {
  const { stages, currentOrder, targetStageId, role, force, reason } = input;
  const canOverride = input.canOverride ?? can(role, "overrideStage");

  if (stages.length === 0) {
    return { ok: false, httpStatus: 500, message: "No stages are configured." };
  }

  const stage = stages.find((item) => item.id === targetStageId);
  if (!stage) {
    return { ok: false, httpStatus: 404, message: "Stage not found." };
  }

  // A role without the override sending force is simply held to the normal rules.
  const isCorrection = force === true && canOverride;
  if (isCorrection && !reason) {
    return {
      ok: false,
      httpStatus: 422,
      message: "A reason is required when overriding the stage order.",
    };
  }

  if (!isCorrection) {
    if (stage.sequenceOrder === currentOrder) {
      return {
        ok: false,
        httpStatus: 409,
        message: `Stage ${stage.name} has already been recorded for this sample.`,
      };
    }
    if (stage.sequenceOrder < currentOrder) {
      return {
        ok: false,
        httpStatus: 409,
        message: `This sample has already passed ${stage.name}. Moving it back needs a correction with a reason.`,
      };
    }
    if (stage.sequenceOrder > currentOrder + 1) {
      const expected = stages.find((item) => item.sequenceOrder === currentOrder + 1);
      return {
        ok: false,
        httpStatus: 409,
        message: `This sample must complete ${expected?.name ?? "the previous stage"} first.`,
      };
    }
  }

  const lastStage = stages[stages.length - 1];
  const status: SampleStatus =
    stage.sequenceOrder >= lastStage.sequenceOrder ? "COMPLETED" : "IN_PROGRESS";

  return { ok: true, stage, isCorrection, status };
}
