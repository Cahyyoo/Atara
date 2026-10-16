import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { setLabSettings } from "@/modules/lab/lib/settings/lab-settings";
import { visibleIdent, visibleLabRecord } from "@/modules/lab/lib/settings/ident-visibility";
import type { LabRecordDTO } from "@/modules/lab/types";

/**
 * The lab admin can keep Sample IDs off the mobile app. Off, a mobile session
 * is told only that a sample has one; the website, and the identity form, are
 * always shown it. The routes run against the real database; skipped when
 * there is none.
 */

const session = {
  userId: "",
  name: "Preparator test",
  email: "",
  role: "PREPARATOR" as const,
  department: "LAB" as const,
  sessionId: "test",
  client: "MOBILE" as "MOBILE" | "WEB",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { GET: getSample } = await import("@/app/api/(lab)/samples/[code]/route");
const { GET: getIdentity } = await import("@/app/api/(lab)/samples/[code]/identity/route");

function get(code: string, handler: typeof getSample, suffix = "") {
  const request = new NextRequest(`http://localhost/api/samples/${code}${suffix}`);
  return handler(request, { params: Promise.resolve({ code }) });
}

describe("visibleLabRecord and visibleIdent", () => {
  const record = { id: "r", labCode: "L", sampleIdent: "MOL/PA4", placeId: "p", pitId: "k", sequenceNo: 9 } as unknown as LabRecordDTO;

  it("leaves a record whole when nothing is hidden, and says an id exists", () => {
    expect(visibleLabRecord(record, false)).toMatchObject({ sampleIdent: "MOL/PA4", placeId: "p", hasSampleIdent: true, identHidden: false });
  });

  it("withholds the id and every part of it, but not that it exists", () => {
    expect(visibleLabRecord(record, true)).toMatchObject({
      labCode: "L",
      sampleIdent: null,
      placeId: null,
      pitId: null,
      sequenceNo: null,
      hasSampleIdent: true,
      identHidden: true,
    });
  });

  it("does the same for a card", () => {
    expect(visibleIdent({ sampleCode: "S", sampleIdent: "MOL" }, true)).toEqual({ sampleCode: "S", sampleIdent: null, hasSampleIdent: true });
    expect(visibleIdent({ sampleCode: "S", sampleIdent: null }, false)).toEqual({ sampleCode: "S", sampleIdent: null, hasSampleIdent: false });
  });
});

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[ident-visibility] skipped: no database reachable");
}

describe.skipIf(!reachable)("the lab admin's Sample ID switch", () => {
  const tag = `IV${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { users: [] as string[], samples: [] as string[] };
  let before: unknown = undefined;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: `${tag} Preparator`, email: `${tag.toLowerCase()}-pr@test.invalid`, password: "x", role: "PREPARATOR", department: "LAB" as const },
    });
    created.users.push(user.id);
    session.userId = user.id;
    before = (await prisma.labSetting.findUnique({ where: { key: "mobileShowSampleIdent" } }))?.value;

    const sample = await prisma.sample.create({
      data: {
        sampleCode: `${tag}-1`,
        createdById: user.id,
        labRecord: {
          create: {
            labCode: `${tag}.1`,
            shiftDate: new Date("2000-12-17T00:00:00Z"),
            sequence: (Date.now() % 100_000) * 100 + 1,
            bargingNo: tag,
            sampleIdent: `MOL/B${tag}`,
          },
        },
      },
    });
    created.samples.push(sample.id);
  });

  afterAll(async () => {
    if (before === undefined) await prisma.labSetting.deleteMany({ where: { key: "mobileShowSampleIdent" } });
    else await setLabSettings({ mobileShowSampleIdent: before as boolean }, session.userId);
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  });

  it("hides the Sample ID from the mobile app when switched off", async () => {
    await setLabSettings({ mobileShowSampleIdent: false }, session.userId);
    session.client = "MOBILE";
    const body = await (await get(`${tag}-1`, getSample)).json();
    expect(body.data.labRecord).toMatchObject({ sampleIdent: null, bargingNo: null, hasSampleIdent: true, identHidden: true });
  });

  it("still shows it on the website", async () => {
    session.client = "WEB";
    const body = await (await get(`${tag}-1`, getSample)).json();
    expect(body.data.labRecord).toMatchObject({ sampleIdent: `MOL/B${tag}`, hasSampleIdent: true, identHidden: false });
  });

  it("still shows it to the identity form on the phone", async () => {
    session.client = "MOBILE";
    const body = await (await get(`${tag}-1`, getIdentity, "/identity")).json();
    expect(body.data).toMatchObject({ sampleIdent: `MOL/B${tag}`, labRecord: { bargingNo: tag } });
  });

  it("shows it to the mobile app again when switched back on", async () => {
    await setLabSettings({ mobileShowSampleIdent: true }, session.userId);
    session.client = "MOBILE";
    const body = await (await get(`${tag}-1`, getSample)).json();
    expect(body.data.labRecord).toMatchObject({ sampleIdent: `MOL/B${tag}`, identHidden: false });
  });
});
