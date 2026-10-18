import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";

/**
 * The drilling sheet against the real database: new holes and unlocked ones
 * checked together, nothing written while a row is wrong, then saved in one
 * go -- a blank box on an unlocked hole clearing what was there. Skipped when
 * there is no database.
 */

const session = {
  userId: "",
  name: "Drill sheet test",
  email: "",
  role: "ADMIN" as const,
  department: "EKSPLORASI" as const,
  sessionId: "test",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { POST: sheetRoute } = await import("@/app/api/(eksplorasi)/drill-holes/sheet/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[drill-hole-sheet-db] skipped: no database reachable");
}

type Row = { line: number; id?: string; cells: Record<string, string> };

async function send(rows: Row[], dryRun: boolean) {
  const response = await sheetRoute(
    new NextRequest("http://localhost/api/drill-holes/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun, rows }),
    })
  );
  return { status: response.status, body: await response.json() };
}

describe.skipIf(!reachable)("the drilling sheet", () => {
  const tag = `SHT${Date.now().toString(36).toUpperCase()}`;
  let stored = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Drill sheet test",
        email: `${tag.toLowerCase()}@test.invalid`,
        password: "x",
        role: "ADMIN",
        department: "EKSPLORASI",
      },
    });
    session.userId = user.id;
    const hole = await prisma.drillHole.create({
      data: { holeId: `${tag}-OLD`, area: "Blok A", totalDepth: 120, status: "ONGOING", createdById: user.id },
    });
    stored = hole.id;
  });

  afterAll(async () => {
    await prisma.drillHole.deleteMany({ where: { holeId: { startsWith: tag } } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  const unchanged = (): Row => ({
    line: 1,
    id: stored,
    cells: { holeId: `${tag}-OLD`, area: "Blok A", status: "Berjalan", totalDepth: "120" },
  });

  it("says what each row would do, and writes nothing on a dry run", async () => {
    const { status, body } = await send(
      [
        unchanged(),
        { line: 2, cells: { holeId: `${tag}-NEW`, area: "Blok B", totalDepth: "85,5", startDate: "01/10/2026" } },
        { line: 3, cells: { holeId: `${tag}-OLD` } },
        { line: 4, cells: { holeId: `${tag}-BAD`, dip: "-120" } },
        { line: 5, cells: { holeId: `${tag}-NEW` } },
      ],
      true
    );
    expect(status).toBe(200);
    expect(body.data.rows.map((row: { line: number; status: string }) => [row.line, row.status])).toEqual([
      [1, "unchanged"],
      [2, "create"],
      [3, "invalid"],
      [4, "invalid"],
      [5, "invalid"],
    ]);
    // The unlocked hole on line 1 already claims that ID on this sheet.
    expect(body.data.rows[2]).toMatchObject({ field: "holeId", message: expect.stringContaining("line 1") });
    expect(body.data.rows[3]).toMatchObject({ field: "dip" });
    expect(body.data.summary).toEqual({ create: 1, update: 0, unchanged: 1, invalid: 3 });
    expect(await prisma.drillHole.count({ where: { holeId: { startsWith: tag } } })).toBe(1);
  });

  it("will not write while any row is invalid, nor add a hole ID already in use", async () => {
    const { body } = await send(
      [
        { line: 1, cells: { holeId: `${tag}-NEW` } },
        { line: 2, cells: { holeId: `${tag}-X`, endDate: "2026-01-01", startDate: "2026-02-01" } },
        { line: 3, cells: { holeId: `${tag.toLowerCase()}-old` } },
      ],
      false
    );
    expect(body.data).toMatchObject({ created: 0, updated: 0, summary: { create: 1, invalid: 2 } });
    expect(body.data.rows[2]).toMatchObject({ field: "holeId", message: expect.stringContaining("already exists") });
    expect(await prisma.drillHole.count({ where: { holeId: { startsWith: tag } } })).toBe(1);
  });

  it("adds the new holes and changes the unlocked one in one save, a blank box clearing its value", async () => {
    const { body } = await send(
      [
        { ...unchanged(), cells: { holeId: `${tag}-OLD`, area: "", status: "Selesai", totalDepth: "150.255" } },
        { line: 2, cells: { holeId: `${tag}-NEW`, area: "Blok B", totalDepth: "85,5", startDate: "01/10/2026" } },
      ],
      false
    );
    expect(body.data).toMatchObject({ created: 1, updated: 1, summary: { create: 1, update: 1, invalid: 0 } });

    const old = await prisma.drillHole.findUniqueOrThrow({ where: { id: stored } });
    expect(old).toMatchObject({ area: null, status: "COMPLETED", updatedById: session.userId });
    expect(old.totalDepth?.toNumber()).toBe(150.26);

    const added = await prisma.drillHole.findUniqueOrThrow({ where: { holeId: `${tag}-NEW` } });
    expect(added).toMatchObject({ area: "Blok B", status: "PLANNED", createdById: session.userId });
    expect(added.totalDepth?.toNumber()).toBe(85.5);
    expect(added.startDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("reads a rounded number as the value already stored", async () => {
    const { body } = await send(
      [{ line: 1, id: stored, cells: { holeId: `${tag}-OLD`, status: "COMPLETED", totalDepth: "150.26" } }],
      true
    );
    expect(body.data.rows[0].status).toBe("unchanged");
  });
});
