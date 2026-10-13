import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardCount } from "@/core/testing/guards";
import { prisma } from "@/core/lib/prisma";
import { applyReplacement, planReplacement } from "@/modules/lab/lib/master/master-option-delete";

/**
 * Deleting a code that Sample IDs already carry: the records move onto the
 * replacement, their Sample IDs are rewritten, and each says why in its
 * history. Against the real database, like login-lockout.test.ts; skipped
 * when there is none.
 */

describe("where it is enforced", () => {
  it("is for whoever manages master data", () => {
    const route = readFileSync(
      join(process.cwd(), "src", "app", "api", "(lab)", "master-options", "[id]", "route.ts"),
      "utf8"
    );
    expect(route).toMatch(/export (async function|const) DELETE/);
    expect(guardCount(route, "manageMasterData")).toBe(2);
  });
});

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[master-option-delete] skipped: no database reachable");
}

type PlaceCode = { id: string; kind: "PLACE"; code: string };

describe.skipIf(!reachable)("moving records onto a replacement (database)", () => {
  const tag = `T${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { samples: [] as string[], options: [] as string[], user: "" };
  let oldCode: PlaceCode;
  let newCode: PlaceCode;
  let other: PlaceCode;

  /** `n` keeps the codes unique; `sampleNo` is what goes into the Sample ID. */
  async function sampleWith(placeId: string, sampleIdent: string, n: number, sampleNo = n) {
    const sample = await prisma.sample.create({
      data: { sampleCode: `${tag}-S${n}`, status: "PENDING", createdById: created.user },
    });
    created.samples.push(sample.id);
    return prisma.labRecord.create({
      data: {
        sampleId: sample.id,
        labCode: `${tag}.L${n}`,
        // A shift day nothing real uses, so the (shiftDate, sequence) pair is free.
        shiftDate: new Date("2000-01-01T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 10 + n,
        placeId,
        bargingNo: "B9",
        sampleNo,
        sampleIdent,
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Delete test",
        email: `${tag.toLowerCase()}@test.invalid`,
        password: "x",
        role: "ADMIN", department: "LAB" as const,
      },
    });
    created.user = user.id;
    const make = async (code: string): Promise<PlaceCode> => {
      const option = await prisma.masterOption.create({ data: { kind: "PLACE", code } });
      created.options.push(option.id);
      return { id: option.id, kind: "PLACE", code };
    };
    oldCode = await make(`${tag}A`);
    newCode = await make(`${tag}B`);
    other = await make(`${tag}C`);
  });

  afterAll(async () => {
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.masterOption.deleteMany({ where: { id: { in: created.options } } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
  });

  it("rewrites each Sample ID and writes the reason into the history", async () => {
    const record = await sampleWith(oldCode.id, `${oldCode.code}/B9/1`, 1);

    await prisma.$transaction(async (tx) => {
      const plan = await planReplacement(tx, oldCode, newCode);
      expect(plan.clashes).toEqual([]);
      expect(plan.moves).toEqual([
        {
          id: record.id,
          labCode: record.labCode,
          from: `${oldCode.code}/B9/1`,
          to: `${newCode.code}/B9/1`,
        },
      ]);
      await applyReplacement(tx, plan, oldCode, newCode, created.user);
    });

    const after = await prisma.labRecord.findUnique({
      where: { id: record.id },
      include: { audits: true },
    });
    expect(after?.placeId).toBe(newCode.id);
    expect(after?.sampleIdent).toBe(`${newCode.code}/B9/1`);
    expect(after?.audits[0]?.reason).toBe(
      `Master data: ${oldCode.code} deleted, replaced by ${newCode.code}`
    );
    expect(after?.audits[0]?.changes).toMatchObject({
      placeId: { from: oldCode.code, to: newCode.code },
    });
  });

  it("names the Sample IDs a move would duplicate, without changing anything", async () => {
    await sampleWith(other.id, `${other.code}/B9/2`, 2);
    const moving = await sampleWith(newCode.id, `${newCode.code}/B9/2`, 3, 2);

    const plan = await prisma.$transaction((tx) => planReplacement(tx, newCode, other));
    expect(plan.clashes).toEqual([`${other.code}/B9/2`]);

    const untouched = await prisma.labRecord.findUnique({ where: { id: moving.id } });
    expect(untouched?.placeId).toBe(newCode.id);
  });
});
