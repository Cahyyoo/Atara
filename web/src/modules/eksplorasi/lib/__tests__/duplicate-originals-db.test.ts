import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { unknownOriginals } from "@/modules/eksplorasi/lib/duplicate-originals";

/**
 * A duplicate's Remarks against the real database: the Sample ID of a FIELD
 * sample, case aside -- or one in the same batch -- and nothing else, through
 * the API as through a sheet or a file. Skipped when there is no database.
 */

const session = {
  userId: "",
  name: "Duplicate originals test",
  email: "",
  role: "ADMIN" as const,
  department: "EKSPLORASI" as const,
  sessionId: "test",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { POST } = await import("@/app/api/(eksplorasi)/data-sources/route");
const { PATCH } = await import("@/app/api/(eksplorasi)/data-sources/[id]/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[duplicate-originals-db] skipped: no database reachable");
}

describe.skipIf(!reachable)("a duplicate's Remarks", () => {
  const tag = `DORG${Date.now().toString(36).toUpperCase()}`;
  let duplicateId = "";

  beforeAll(async () => {
    session.userId = (
      await prisma.user.create({
        data: { name: "Duplicate originals test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "EKSPLORASI" },
      })
    ).id;
    await prisma.dataSource.createMany({
      data: [
        { sampleId: `${tag}-F1`, sampleType: "FIELD", createdById: session.userId },
        { sampleId: `${tag}-S1`, sampleType: "STANDARD", createdById: session.userId },
      ],
    });
    duplicateId = (await prisma.dataSource.create({ data: { sampleId: `${tag}-D0`, sampleType: "DUPLICATE", createdById: session.userId } })).id;
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  const row = (line: number, sampleId: string, sampleType: "FIELD" | "DUPLICATE", originalSampleIdRemarks: string | null = null) => ({
    line,
    data: { sampleId: `${tag}-${sampleId}`, sampleType, originalSampleIdRemarks },
  });

  it("names a FIELD sample, in the database or in the same batch, case aside", async () => {
    const errors = await unknownOriginals([
      row(1, "D1", "DUPLICATE", `${tag}-F1`.toLowerCase()),
      row(2, "F2", "FIELD"),
      row(3, "D2", "DUPLICATE", `${tag}-F2`),
      row(4, "D3", "DUPLICATE", null),
    ]);
    expect(errors).toEqual([]);
  });

  it("is refused at its column when it names a sample of another type, or none", async () => {
    const errors = await unknownOriginals([
      row(1, "D1", "DUPLICATE", `${tag}-S1`),
      row(2, "D2", "DUPLICATE", "Repeats DH-3 12 m"),
    ]);
    expect(errors.map((error) => [error.line, error.field])).toEqual([
      [1, "originalSampleIdRemarks"],
      [2, "originalSampleIdRemarks"],
    ]);
  });

  it("is held to the same rule through the API, creating or changing a row", async () => {
    const send = (method: "POST" | "PATCH", path: string, body: unknown) =>
      new NextRequest(`http://localhost${path}`, { method, body: JSON.stringify(body) });

    const created = await POST(
      send("POST", "/api/data-sources", { sampleId: `${tag}-D4`, sampleType: "DUPLICATE", originalSampleIdRemarks: "nope" }),
      { params: Promise.resolve({}) }
    );
    expect(created.status).toBe(422);
    expect(await prisma.dataSource.count({ where: { sampleId: `${tag}-D4` } })).toBe(0);

    const changed = await PATCH(send("PATCH", `/api/data-sources/${duplicateId}`, { originalSampleIdRemarks: "nope" }), {
      params: Promise.resolve({ id: duplicateId }),
    });
    expect(changed.status).toBe(422);

    const fixed = await PATCH(send("PATCH", `/api/data-sources/${duplicateId}`, { originalSampleIdRemarks: `${tag}-F1` }), {
      params: Promise.resolve({ id: duplicateId }),
    });
    expect(fixed.status).toBe(200);
  });
});
