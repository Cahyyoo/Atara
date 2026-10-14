import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { SAMPLE_IDENT_REQUIRED } from "@/modules/lab/lib/stages/stage-transition";

/**
 * A scan does not move a sample that has no Sample ID yet: it is filled in
 * first, then moved. Against the real database; skipped when there is none.
 */

const session = { userId: "", name: "Preparator test", email: "", role: "PREPARATOR" as const, department: "LAB" as const, sessionId: "test" };
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { POST: scan } = await import("@/app/api/(lab)/samples/scan/route");

function post(body: unknown) {
  const text = JSON.stringify(body);
  return scan(
    new NextRequest("http://localhost/api/samples/scan", {
      method: "POST",
      body: text,
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
    })
  );
}

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[scan-needs-ident] skipped: no database reachable");
}

describe.skipIf(!reachable)("a scan of a sample without a Sample ID", () => {
  const tag = `SI${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { users: [] as string[], samples: [] as string[] };
  let firstStageId = "";

  beforeAll(async () => {
    const preparator = await prisma.user.create({
      data: { name: `${tag} Preparator`, email: `${tag.toLowerCase()}-pr@test.invalid`, password: "x", role: "PREPARATOR", department: "LAB" as const },
    });
    created.users.push(preparator.id);
    session.userId = preparator.id;

    const first = await prisma.stage.findFirst({ orderBy: { sequenceOrder: "asc" } });
    firstStageId = first!.id;

    for (const [n, ident] of [[1, null], [2, `MOL/B${tag}/1`]] as const) {
      const sample = await prisma.sample.create({
        data: {
          sampleCode: `${tag}-${n}`,
          createdById: preparator.id,
          labRecord: {
            create: {
              labCode: `${tag}.${n}`,
              shiftDate: new Date("2000-12-17T00:00:00Z"),
              sequence: (Date.now() % 100_000) * 100 + n,
              sampleIdent: ident,
            },
          },
        },
      });
      created.samples.push(sample.id);
    }
  });

  afterAll(async () => {
    await prisma.sampleLog.deleteMany({ where: { sampleId: { in: created.samples } } });
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  });

  it("is refused, by name, and nothing moves", async () => {
    const response = await post({ sample_code: `${tag}-1`, stage_id: firstStageId });
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe(SAMPLE_IDENT_REQUIRED);

    const sample = await prisma.sample.findUnique({ where: { sampleCode: `${tag}-1` } });
    expect(sample?.currentStageId).toBeNull();
  });

  it("goes through once the Sample ID is there", async () => {
    const response = await post({ sample_code: `${tag}-2`, stage_id: firstStageId });
    expect(response.status).toBe(200);
  });
});
