import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadStages } from "@/lib/stages-cache";
import { applyStageMove } from "@/lib/stage-move";
import { evaluateStageTransition } from "@/lib/stage-transition";
import { buildStageBoard } from "@/lib/stage-board";
import { buildGradeControl } from "@/lib/grade-control";
import { qualityWhere } from "@/lib/data-quality";

/**
 * The stage correction, the stage board, grade control and the data-quality
 * checks, against the real database. Fixtures are dated in 2000-2001 so they
 * sort first (the board shows the oldest) and fall in a window no real
 * sample is in (grade control). Skipped when there is no database.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

describe("where it is enforced", () => {
  it("writes scans and corrections through the one helper", () => {
    expect(read("app", "api", "samples", "scan", "route.ts")).toContain("applyStageMove(");
    expect(read("app", "api", "samples", "[code]", "stage", "route.ts")).toContain("applyStageMove(");
  });

  it("has no stage board page any more; its data serves the TV view", () => {
    expect(existsSync(join(process.cwd(), "src", "app", "(app)", "board", "page.tsx"))).toBe(false);
    expect(read("components", "layout", "sidebar-nav.tsx")).not.toContain('"/board"');
    expect(read("app", "(tv)", "lab", "tv", "page.tsx")).toContain("loadStageBoard()");
  });

  it("guards each new route with its capability", () => {
    expect(read("app", "api", "samples", "board", "route.ts")).toContain(
      'requireCapability(request, "viewDashboard")'
    );
    expect(read("app", "api", "grade-control", "route.ts")).toContain(
      'requireCapability(request, "readLabRecords")'
    );
    expect(read("app", "api", "data-quality", "route.ts")).toContain(
      'requireCapability(request, "viewDatabase")'
    );
  });
});

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[floor-features] skipped: no database reachable");
}

describe.skipIf(!reachable)("against the database", () => {
  const tag = `F${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { samples: [] as string[], options: [] as string[], user: "" };
  let seq = 0;
  let stages: Awaited<ReturnType<typeof loadStages>>;

  async function sample(data: {
    status?: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    stageId?: string | null;
    enteredAt?: Date | null;
    createdAt: Date;
    record?: Record<string, unknown>;
  }) {
    seq += 1;
    const row = await prisma.sample.create({
      data: {
        sampleCode: `${tag}-${seq}`,
        status: data.status ?? "PENDING",
        createdById: created.user,
        currentStageId: data.stageId ?? null,
        stageEnteredAt: data.enteredAt ?? null,
        createdAt: data.createdAt,
      },
    });
    created.samples.push(row.id);
    const record = await prisma.labRecord.create({
      data: {
        sampleId: row.id,
        labCode: `${tag}.${seq}`,
        shiftDate: new Date("2000-01-02T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + seq,
        createdAt: data.createdAt,
        ...data.record,
      },
    });
    return { sample: row, record };
  }

  async function pit(code: string, kind: "PIT" | "ROCK_TYPE" = "PIT") {
    const option = await prisma.masterOption.create({ data: { kind, code } });
    created.options.push(option.id);
    return option.id;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Floor test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "LAB" as const },
    });
    created.user = user.id;
    stages = await loadStages();
  });

  afterAll(async () => {
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.masterOption.deleteMany({ where: { id: { in: created.options } } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
  });

  it("logs a correction, and refuses a move from a stage the sample has left", async () => {
    const [first, , third] = stages;
    const { sample: row } = await sample({
      status: "IN_PROGRESS",
      stageId: first.id,
      enteredAt: new Date("2000-01-01T00:00:00Z"),
      createdAt: new Date("2000-01-01T00:00:00Z"),
    });

    const decision = evaluateStageTransition({
      stages,
      currentOrder: first.sequenceOrder,
      targetStageId: third.id,
      role: "ADMIN",
      force: true,
      canOverride: true,
      reason: "Test correction",
    });
    if (!decision.ok) throw new Error(decision.message);

    const moved = await applyStageMove({ sample: row, decision, userId: created.user, notes: "Test correction" });
    expect(moved.currentStageId).toBe(third.id);
    const log = await prisma.sampleLog.findFirst({ where: { sampleId: row.id } });
    expect(log).toMatchObject({ isCorrection: true, notes: "Test correction", operatorId: created.user });

    // The same move again from the stage it was read on: somebody else won.
    await expect(
      applyStageMove({ sample: row, decision, userId: created.user, notes: "again" })
    ).rejects.toMatchObject({ status: 409, code: "STAGE_MOVED" });
  });

  it("puts each staged sample in its column, oldest first, flags the late ones, and leaves out the unreceived", async () => {
    const old = new Date("2000-01-01T00:00:00Z");
    const waiting = await sample({ createdAt: old });
    const stuck = await sample({ status: "IN_PROGRESS", stageId: stages[1].id, enteredAt: old, createdAt: old });
    const finished = await sample({
      status: "COMPLETED",
      stageId: stages.at(-1)!.id,
      enteredAt: new Date(Date.now() - 60_000),
      createdAt: old,
    });
    const finishedLongAgo = await sample({
      status: "COMPLETED",
      stageId: stages.at(-1)!.id,
      enteredAt: old,
      createdAt: old,
    });

    const board = await buildStageBoard();
    const column = (id: string) => board.columns.find((entry) => entry.id === id)!;
    const codes = (id: string) => column(id).cards.map((card) => card.sampleCode);

    // Samples not received yet have no stage, and the TV no longer shows them.
    expect(board.columns[0].id).toBe(stages[0].id);
    expect(board.columns.every((entry) => entry.kind !== ("pending" as string))).toBe(true);
    expect(board.columns.flatMap((entry) => entry.cards).map((card) => card.sampleCode)).not.toContain(
      waiting.sample.sampleCode
    );
    const stuckCard = column(stages[1].id).cards.find((card) => card.sampleCode === stuck.sample.sampleCode);
    expect(stuckCard?.overdue).toBe(true);
    expect(codes(stages.at(-1)!.id)).toContain(finished.sample.sampleCode);
    expect(codes(stages.at(-1)!.id)).not.toContain(finishedLongAgo.sample.sampleCode);
  });

  it("averages grades per pit over the assayed samples only", async () => {
    const at = new Date("2001-03-01T05:00:00Z");
    const pitA = await pit(`${tag}A`);
    const pitB = await pit(`${tag}B`);
    await sample({ createdAt: at, record: { pitId: pitA, ni: 1.5, fe: 20 } });
    await sample({ createdAt: at, record: { pitId: pitA, ni: 2.5, fe: 30 } });
    await sample({ createdAt: at, record: { pitId: pitA, ni: null } });
    await sample({ createdAt: at, record: { pitId: pitB, ni: 1.0 } });
    await sample({ createdAt: at, record: { pitId: null, ni: 0.5 } });

    const result = await buildGradeControl(
      new Date("2001-03-01T00:00:00Z"),
      new Date("2001-03-02T00:00:00Z"),
      ["pit"]
    );

    expect(result.rows.map((row) => row.codes.pit)).toEqual([`${tag}A`, `${tag}B`, "—"]);
    expect(result.rows[0]).toMatchObject({
      samples: 3,
      assayed: 2,
      niMin: 1.5,
      niMax: 2.5,
      avg: { ni: 2, fe: 25 },
    });
  });

  it("groups by barging run as written, the spelling evened out", async () => {
    const at = new Date("2001-05-01T05:00:00Z");
    const p1 = await pit(`${tag}Q1`);
    await sample({ createdAt: at, record: { pitId: p1, bargingNo: `${tag}b10`, ni: 1.0 } });
    await sample({ createdAt: at, record: { pitId: p1, bargingNo: ` ${tag}B10 `, ni: 2.0 } });
    await sample({ createdAt: at, record: { pitId: p1, bargingNo: "", ni: 4.0 } });

    const window = [new Date("2001-05-01T00:00:00Z"), new Date("2001-05-02T00:00:00Z")] as const;
    const alone = await buildGradeControl(window[0], window[1], ["barging"]);
    expect(alone.rows.map((row) => [row.codes.barging, row.samples, row.avg.ni])).toEqual([
      ["—", 1, 4],
      [`${tag}B10`.toUpperCase(), 2, 1.5],
    ]);

    const withPit = await buildGradeControl(window[0], window[1], ["barging", "pit"]);
    expect(withPit.groupBy).toEqual(["pit", "barging"]);
    expect(withPit.rows).toHaveLength(2);
  });

  it("combines groups: one row per pit and rock type that occur together", async () => {
    const at = new Date("2001-04-01T05:00:00Z");
    const p1 = await pit(`${tag}P1`);
    const p2 = await pit(`${tag}P2`);
    const r1 = await pit(`${tag}R1`, "ROCK_TYPE");
    const r2 = await pit(`${tag}R2`, "ROCK_TYPE");
    await sample({ createdAt: at, record: { pitId: p1, rockTypeId: r1, ni: 1.0 } });
    await sample({ createdAt: at, record: { pitId: p1, rockTypeId: r1, ni: 2.0 } });
    await sample({ createdAt: at, record: { pitId: p1, rockTypeId: r2, ni: 3.0 } });
    await sample({ createdAt: at, record: { pitId: p2, rockTypeId: r1, ni: 0.8 } });
    await sample({ createdAt: at, record: { pitId: p2, rockTypeId: null, ni: 1.2 } });

    // Asked in the "wrong" order: the result keeps the fixed one.
    const result = await buildGradeControl(
      new Date("2001-04-01T00:00:00Z"),
      new Date("2001-04-02T00:00:00Z"),
      ["rockType", "pit"]
    );

    expect(result.groupBy).toEqual(["pit", "rockType"]);
    expect(result.rows.map((row) => [row.codes.pit, row.codes.rockType, row.avg.ni, row.samples])).toEqual([
      [`${tag}P1`, `${tag}R2`, 3, 1],
      [`${tag}P1`, `${tag}R1`, 1.5, 2],
      [`${tag}P2`, "—", 1.2, 1],
      [`${tag}P2`, `${tag}R1`, 0.8, 1],
    ]);
    expect(new Set(result.rows.map((row) => row.key)).size).toBe(4);
  });

  it("finds records with a missing column, and old records without a result", async () => {
    const old = new Date("2000-06-01T00:00:00Z");
    const noPit = await sample({ createdAt: old, record: { pitId: null, ni: 1.2 } });
    const fresh = await sample({ createdAt: new Date(), record: { ni: null } });

    const find = (where: object, labCode: string) =>
      prisma.labRecord.count({ where: { AND: [where, { labCode }] } });

    expect(await find(qualityWhere({ check: "identity", gap: "pit", days: 3, page: 1 }), noPit.record.labCode)).toBe(1);
    expect(await find(qualityWhere({ check: "results", days: 3, page: 1 }), noPit.record.labCode)).toBe(0);
    expect(await find(qualityWhere({ check: "results", days: 3, page: 1 }), fresh.record.labCode)).toBe(0);

    const oldNoResult = await sample({ createdAt: old, record: { ni: null } });
    expect(await find(qualityWhere({ check: "results", days: 3, page: 1 }), oldNoResult.record.labCode)).toBe(1);
  });
});
