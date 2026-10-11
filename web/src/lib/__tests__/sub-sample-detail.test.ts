import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadSubSampleDetail } from "@/lib/sub-sample-detail";
import { subSamplePath } from "@/lib/sample-ident";

/**
 * What a sub-sample's page is read from: the sub, its sample, the other subs
 * and the sub's own history. Against the real database; skipped when there is
 * none.
 */

describe("subSamplePath", () => {
  it("puts the sub under its sample's page, codes escaped", () => {
    expect(subSamplePath("SMPL-2026-00099", "-20")).toBe("/lab/samples/SMPL-2026-00099/sub/-20");
    expect(subSamplePath("SMPL 1", "+40")).toBe("/lab/samples/SMPL%201/sub/%2B40");
  });
});

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[sub-sample-detail] skipped: no database reachable");
}

describe.skipIf(!reachable)("loadSubSampleDetail against the database", () => {
  const tag = `D${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { sample: "", user: "" };
  let minus = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Sub page test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ANALISIS", department: "LAB" as const },
    });
    created.user = user.id;
    const sample = await prisma.sample.create({
      data: { sampleCode: `${tag}-1`, status: "IN_PROGRESS", createdById: user.id },
    });
    created.sample = sample.id;
    const parent = await prisma.labRecord.create({
      data: {
        sampleId: sample.id,
        labCode: `${tag}.1`,
        shiftDate: new Date("2000-01-04T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + 1,
        sampleIdent: `${tag}/1/25`,
      },
    });
    const sub = (code: string, ni: number) =>
      prisma.labRecord.create({
        data: {
          labCode: `${tag}.1 (${code})`,
          shiftDate: parent.shiftDate,
          parentId: parent.id,
          subCode: code,
          sampleIdent: `${tag}/1/25 (${code})`,
          ni,
        },
      });
    minus = (await sub("-20", 1.4)).id;
    await sub("+40", 1.1);
    await prisma.labRecordAudit.create({
      data: { labRecordId: minus, changedById: user.id, changes: { ni: { from: null, to: 1.4 } } },
    });
  });

  afterAll(async () => {
    if (created.sample) await prisma.sample.delete({ where: { id: created.sample } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
  });

  it("reads the sub, its sample, the other subs and the sub's own history", async () => {
    const detail = (await loadSubSampleDetail(`${tag}-1`, "-20"))!;
    expect(detail.sub.id).toBe(minus);
    expect(detail.sample).toMatchObject({ sampleCode: `${tag}-1`, status: "IN_PROGRESS" });
    expect(detail.parent.labCode).toBe(`${tag}.1`);
    expect(detail.others.map((other) => other.subCode)).toEqual(["+40"]);
    expect(detail.audits).toHaveLength(1);
  });

  it("reads the code the way it is stored, and finds nothing that is not there", async () => {
    expect((await loadSubSampleDetail(`${tag}-1`, " -20 "))?.sub.id).toBe(minus);
    expect(await loadSubSampleDetail(`${tag}-1`, "-99")).toBeNull();
    expect(await loadSubSampleDetail(`${tag}-NOPE`, "-20")).toBeNull();
  });

  it("finds nothing under a removed sample", async () => {
    await prisma.sample.update({ where: { id: created.sample }, data: { deletedAt: new Date() } });
    expect(await loadSubSampleDetail(`${tag}-1`, "-20")).toBeNull();
    await prisma.sample.update({ where: { id: created.sample }, data: { deletedAt: null } });
  });
});
