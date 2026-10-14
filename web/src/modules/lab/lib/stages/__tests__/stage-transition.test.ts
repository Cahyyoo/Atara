import { describe, expect, it } from "vitest";
import { evaluateStageTransition, type StageLike } from "@/modules/lab/lib/stages/stage-transition";

const STAGES: StageLike[] = [
  { id: "s1", name: "Preparation", sequenceOrder: 1 },
  { id: "s2", name: "Drying", sequenceOrder: 2 },
  { id: "s3", name: "Weighing", sequenceOrder: 3 },
  { id: "s4", name: "XRF/ICP Analysis", sequenceOrder: 4 },
  { id: "s5", name: "Reporting", sequenceOrder: 5 },
];

function evaluate(overrides: Partial<Parameters<typeof evaluateStageTransition>[0]>) {
  return evaluateStageTransition({
    stages: STAGES,
    currentOrder: 0,
    targetStageId: "s1",
    role: "PREPARATOR",
    ...overrides,
  });
}

describe("moving forward in order", () => {
  it("accepts the first stage for a brand new sample", () => {
    const result = evaluate({ currentOrder: 0, targetStageId: "s1" });
    expect(result).toMatchObject({ ok: true, isCorrection: false, status: "IN_PROGRESS" });
  });

  it("accepts the next stage in sequence", () => {
    const result = evaluate({ currentOrder: 2, targetStageId: "s3" });
    expect(result).toMatchObject({ ok: true, status: "IN_PROGRESS" });
  });

  it("completes the sample on the final stage", () => {
    const result = evaluate({ currentOrder: 4, targetStageId: "s5" });
    expect(result).toMatchObject({ ok: true, status: "COMPLETED" });
  });
});

describe("rejections", () => {
  it("refuses a repeat scan of the current stage", () => {
    const result = evaluate({ currentOrder: 2, targetStageId: "s2" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.httpStatus).toBe(409);
    expect(result.message).toContain("already been recorded");
    expect(result.message).toContain("Drying");
    // The phone's offline queue reads this to tell "already done" (a resend
    // after a timeout) from a real refusal.
    expect(result.code).toBe("STAGE_ALREADY_RECORDED");
  });

  it("tags only the repeat: other refusals carry no code", () => {
    for (const [currentOrder, targetStageId] of [[3, "s1"], [1, "s5"]] as const) {
      const result = evaluate({ currentOrder, targetStageId });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBeUndefined();
    }
  });

  it("refuses moving backwards without a correction, and says one is needed", () => {
    const result = evaluate({ currentOrder: 3, targetStageId: "s1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.httpStatus).toBe(409);
    expect(result.message).toContain("already passed Preparation");
    expect(result.message).toContain("correction with a reason");
  });

  it("refuses skipping ahead and names the stage that must come first", () => {
    const result = evaluate({ currentOrder: 1, targetStageId: "s5" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.httpStatus).toBe(409);
    expect(result.message).toBe("This sample must complete Drying first.");
  });

  it("refuses skipping even a single stage", () => {
    const result = evaluate({ currentOrder: 1, targetStageId: "s3" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Drying");
  });

  it("returns 404 for an unknown stage id", () => {
    const result = evaluate({ targetStageId: "does-not-exist" });
    expect(result).toMatchObject({ ok: false, httpStatus: 404, message: "Stage not found." });
  });

  it("refuses when no stages are configured at all", () => {
    const result = evaluate({ stages: [] });
    expect(result).toMatchObject({ ok: false, httpStatus: 500 });
  });
});

/**
 * The operator's override. Moving samples is the operator's job, so the
 * correction that steps one back or past a stage is theirs too -- with a
 * reason, and flagged as a correction in the trail.
 */
describe("operator override", () => {
  it("requires a reason", () => {
    const result = evaluate({
      currentOrder: 3,
      targetStageId: "s1",
      force: true,
    });
    expect(result).toMatchObject({ ok: false, httpStatus: 422 });
    if (result.ok) return;
    expect(result.message).toContain("reason is required");
  });

  it("treats an empty reason as no reason", () => {
    const result = evaluate({
      currentOrder: 3,
      targetStageId: "s1",
      force: true,
      reason: "",
    });
    expect(result).toMatchObject({ ok: false, httpStatus: 422 });
  });

  it("allows moving a sample backwards, flagged as a correction", () => {
    const result = evaluate({
      currentOrder: 3,
      targetStageId: "s1",
      force: true,
      reason: "Scanned into Drying by mistake.",
    });
    expect(result).toMatchObject({ ok: true, isCorrection: true, status: "IN_PROGRESS" });
  });

  it("allows skipping ahead, and still completes on the last stage", () => {
    const result = evaluate({
      currentOrder: 1,
      targetStageId: "s5",
      force: true,
      reason: "Backfilling a run processed offline.",
    });
    expect(result).toMatchObject({ ok: true, isCorrection: true, status: "COMPLETED" });
  });

  it("ignores force from every other role, which stays bound by the order", () => {
    for (const role of ["ADMIN", "DATABASE", "ANALISIS"] as const) {
      const result = evaluate({
        currentOrder: 1,
        targetStageId: "s5",
        role,
        force: true,
        reason: "Let me through please.",
      });
      expect(result, role).toMatchObject({ ok: false, httpStatus: 409 });
    }
  });

  it("does not flag an in-order scan as a correction", () => {
    const result = evaluate({ currentOrder: 1, targetStageId: "s2" });
    expect(result).toMatchObject({ ok: true, isCorrection: false });
  });
});

describe("the administrator's correction from the website", () => {
  it("honours force when the caller has already checked correctStage", () => {
    const back = evaluate({
      currentOrder: 4,
      targetStageId: "s2",
      role: "ADMIN",
      force: true,
      canOverride: true,
      reason: "Scanned into analysis by mistake.",
    });
    expect(back).toMatchObject({ ok: true, isCorrection: true, status: "IN_PROGRESS" });

    const skip = evaluate({
      currentOrder: 1,
      targetStageId: "s5",
      role: "ADMIN",
      force: true,
      canOverride: true,
      reason: "Reported on paper already.",
    });
    expect(skip).toMatchObject({ ok: true, isCorrection: true, status: "COMPLETED" });
  });

  it("still wants a reason", () => {
    const result = evaluate({
      currentOrder: 3,
      targetStageId: "s1",
      role: "ADMIN",
      force: true,
      canOverride: true,
      reason: "",
    });
    expect(result).toMatchObject({ ok: false, httpStatus: 422 });
  });
});
