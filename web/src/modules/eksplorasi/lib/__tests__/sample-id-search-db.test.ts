import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { SAMPLE_ID_SEARCH_LIMIT, sampleIdSearchQuerySchema } from "@/modules/eksplorasi/validation";

/**
 * The Duplicate list's Remarks dropdown against the real database, through
 * its route: only FIELD samples' Sample IDs, those holding the search, in
 * order, and no more than asked for. Skipped when there is no database.
 */

const session = {
  userId: "",
  name: "Sample ID search test",
  email: "",
  role: "ADMIN" as const,
  department: "EKSPLORASI" as const,
  sessionId: "test",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { GET } = await import("@/app/api/(eksplorasi)/data-sources/sample-ids/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[sample-id-search-db] skipped: no database reachable");
}

async function search(query: Record<string, string>) {
  const url = `http://localhost/api/data-sources/sample-ids?${new URLSearchParams(query)}`;
  const response = await GET(new NextRequest(url), { params: Promise.resolve({}) });
  return { status: response.status, body: await response.json() };
}

describe("the Sample ID search's input", () => {
  it("asks for a page at most, and a search of a sensible length", () => {
    expect(sampleIdSearchQuerySchema.parse({}).limit).toBe(SAMPLE_ID_SEARCH_LIMIT);
    expect(sampleIdSearchQuerySchema.safeParse({ limit: String(SAMPLE_ID_SEARCH_LIMIT + 1) }).success).toBe(false);
    expect(sampleIdSearchQuerySchema.safeParse({ search: "x".repeat(101) }).success).toBe(false);
  });
});

describe.skipIf(!reachable)("searching the FIELD samples' Sample IDs", () => {
  const tag = `SIDS${Date.now().toString(36).toUpperCase()}`;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Sample ID search test",
        email: `${tag.toLowerCase()}@test.invalid`,
        password: "x",
        role: "ADMIN",
        department: "EKSPLORASI",
      },
    });
    session.userId = user.id;
    const row = (sampleId: string, sampleType: "FIELD" | "STANDARD" | "BLANK" | "DUPLICATE") => ({
      sampleId: `${tag}-${sampleId}`,
      sampleType,
      createdById: user.id,
    });
    await prisma.dataSource.createMany({
      data: [
        row("F-0003", "FIELD"),
        row("F-0001", "FIELD"),
        row("F-0002", "FIELD"),
        row("S-0001", "STANDARD"),
        row("B-0001", "BLANK"),
        row("F-0001-D", "DUPLICATE"),
      ],
    });
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  it("answers with the FIELD samples holding the search, in order, and nothing else", async () => {
    const { status, body } = await search({ search: tag });
    expect(status).toBe(200);
    expect(body.data).toEqual([`${tag}-F-0001`, `${tag}-F-0002`, `${tag}-F-0003`]);
  });

  it("finds part of a Sample ID, and no more than the limit", async () => {
    expect((await search({ search: `${tag}-F-0002` })).body.data).toEqual([`${tag}-F-0002`]);
    expect((await search({ search: tag, limit: "2" })).body.data).toEqual([`${tag}-F-0001`, `${tag}-F-0002`]);
  });
});
