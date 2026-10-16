import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";

/**
 * A sample's identity filled in by barcode, the way the preparator does it
 * from the mobile app. Against the real database; skipped when there is none.
 */

const session = { userId: "", name: "Preparator test", email: "", role: "PREPARATOR" as const, department: "LAB" as const, sessionId: "test" };
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { PATCH: editIdentity } = await import("@/app/api/(lab)/samples/[code]/identity/route");

function patch(code: string, body: unknown) {
  const text = JSON.stringify(body);
  const request = new NextRequest(`http://localhost/api/samples/${code}/identity`, {
    method: "PATCH",
    body: text,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
  });
  return editIdentity(request, { params: Promise.resolve({ code }) });
}

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[sample-identity-route] skipped: no database reachable");
}

describe.skipIf(!reachable)("filling in a sample's identity by barcode", () => {
  const tag = `ID${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { users: [] as string[], samples: [] as string[], option: "" };
  const records: string[] = [];
  let placeId = "";

  beforeAll(async () => {
    const preparator = await prisma.user.create({
      data: { name: `${tag} Preparator`, email: `${tag.toLowerCase()}-pr@test.invalid`, password: "x", role: "PREPARATOR", department: "LAB" as const },
    });
    created.users.push(preparator.id);
    session.userId = preparator.id;

    let place = await prisma.masterOption.findFirst({ where: { kind: "PLACE", code: "MOL" } });
    if (!place) {
      place = await prisma.masterOption.create({ data: { kind: "PLACE", code: "MOL" } });
      created.option = place.id;
    }
    placeId = place.id;

    for (const n of [1, 2]) {
      const sample = await prisma.sample.create({
        data: { sampleCode: `${tag}-${n}`, createdById: preparator.id },
      });
      created.samples.push(sample.id);
      const record = await prisma.labRecord.create({
        data: {
          sampleId: sample.id,
          labCode: `${tag}.${n}`,
          shiftDate: new Date("2000-12-17T00:00:00Z"),
          sequence: (Date.now() % 100_000) * 100 + n,
        },
      });
      records.push(record.id);
    }
  });

  afterAll(async () => {
    await prisma.labRecordAudit.deleteMany({ where: { labRecordId: { in: records } } });
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    if (created.option) await prisma.masterOption.delete({ where: { id: created.option } });
  });

  it("composes the id on a dry run without writing it", async () => {
    const response = await patch(`${tag}-1`, { placeId, bargingNo: tag, sequenceNo: 7, dryRun: true });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      sampleIdent: `MOL/${tag}/7`,
      changed: true,
      clash: null,
    });
    const record = await prisma.labRecord.findUnique({ where: { id: records[0] } });
    expect(record?.sampleIdent).toBeNull();
  });

  it("saves the identity and audits it under the preparator", async () => {
    const response = await patch(`${tag}-1`, { placeId, bargingNo: tag, sequenceNo: 7 });
    expect(response.status).toBe(200);
    expect((await response.json()).data.labRecord).toMatchObject({ sampleIdent: `MOL/${tag}/7`, sequenceNo: 7 });
    const audit = await prisma.labRecordAudit.findFirst({ where: { labRecordId: records[0], changedById: session.userId } });
    expect(audit?.changes).toMatchObject({ sampleIdent: { from: null, to: `MOL/${tag}/7` } });
  });

  it("names the sample that already holds an id, on a dry run and on a save", async () => {
    const identity = { placeId, bargingNo: tag, sequenceNo: 7 };
    const dry = await patch(`${tag}-2`, { ...identity, dryRun: true });
    expect((await dry.json()).data.clash).toEqual({ sampleCode: `${tag}-1` });

    const save = await patch(`${tag}-2`, identity);
    expect(save.status).toBe(409);
    expect((await save.json()).error).toContain(`${tag}-1`);
  });

  it("takes nothing but the identity", async () => {
    const response = await patch(`${tag}-2`, { placeId, ni: 1.5 });
    expect(response.status).toBe(422);
  });

  it("answers 404 for a barcode that does not exist", async () => {
    const response = await patch(`${tag}-404`, { placeId });
    expect(response.status).toBe(404);
  });
});
