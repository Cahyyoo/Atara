import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";

/**
 * A list's sheet against the real database: new rows and unlocked ones
 * checked together, nothing written while a row is wrong, then saved in one
 * go -- a blank box on an unlocked row clearing what was there, and the
 * columns a QC list does not show left alone. Skipped when there is no
 * database.
 */

const session = {
  userId: "",
  name: "Data source sheet test",
  email: "",
  role: "ADMIN" as const,
  department: "EKSPLORASI" as const,
  sessionId: "test",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { POST: sheetRoute } = await import("@/app/api/(eksplorasi)/data-sources/sheet/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[data-source-sheet-db] skipped: no database reachable");
}

type Row = { line: number; id?: string; cells: Record<string, string> };

async function send(view: string, rows: Row[], dryRun: boolean) {
  const response = await sheetRoute(
    new NextRequest("http://localhost/api/data-sources/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun, view, rows }),
    })
  );
  return { status: response.status, body: await response.json() };
}

describe.skipIf(!reachable)("a list's sheet", () => {
  const tag = `SHT${Date.now().toString(36).toUpperCase()}`;
  let stored = "";
  let standard = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Data source sheet test",
        email: `${tag.toLowerCase()}@test.invalid`,
        password: "x",
        role: "ADMIN",
        department: "EKSPLORASI",
      },
    });
    session.userId = user.id;
    stored = (
      await prisma.dataSource.create({
        data: { sampleId: `${tag}-OLD`, sampleType: "ORIGINAL", campaign: "C1", ni: "1.5", createdById: user.id },
      })
    ).id;
    standard = (
      await prisma.dataSource.create({
        data: { sampleId: `${tag}-STD`, sampleType: "STANDARD", control: "OREAS", from: "10", ni: "2.0", createdById: user.id },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  const unchanged = (): Row => ({
    line: 1,
    id: stored,
    cells: { sampleId: `${tag}-OLD`, sampleType: "Sampel biasa", campaign: "C1", ni: "1.5" },
  });

  it("says what each row would do, and writes nothing on a dry run", async () => {
    const { status, body } = await send(
      "dataSource",
      [
        unchanged(),
        { line: 2, cells: { sampleId: `${tag}-NEW`, sampleType: "std", date: "01/10/2026", ni: "<0.01" } },
        { line: 3, cells: { sampleId: `${tag}-OLD`, sampleType: "ORIGINAL" } },
        { line: 4, cells: { sampleId: `${tag}-BAD`, sampleType: "ORIGINAL", date: "2026-13-01" } },
        { line: 5, cells: { sampleId: `${tag}-NOTYPE` } },
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
    // The unlocked row on line 1 already claims that ID on this sheet.
    expect(body.data.rows[2]).toMatchObject({ field: "sampleId", message: expect.stringContaining("line 1") });
    expect(body.data.rows[3]).toMatchObject({ field: "date" });
    expect(body.data.rows[4]).toMatchObject({ field: "sampleType" });
    expect(await prisma.dataSource.count({ where: { sampleId: { startsWith: tag } } })).toBe(2);
  });

  it("will not write while any row is invalid, nor add a sample ID already in use", async () => {
    const { body } = await send(
      "dataSource",
      [
        { line: 1, cells: { sampleId: `${tag}-NEW`, sampleType: "BLANK" } },
        { line: 2, cells: { sampleId: `${tag.toLowerCase()}-old`, sampleType: "BLANK" } },
      ],
      false
    );
    expect(body.data).toMatchObject({ created: 0, updated: 0, summary: { create: 1, invalid: 1 } });
    expect(body.data.rows[1]).toMatchObject({ field: "sampleId", message: expect.stringContaining("already exists") });
    expect(await prisma.dataSource.count({ where: { sampleId: { startsWith: tag } } })).toBe(2);
  });

  it("adds the new rows and changes the unlocked one in one save, a blank box clearing its value", async () => {
    const { body } = await send(
      "dataSource",
      [
        { ...unchanged(), cells: { sampleId: `${tag}-OLD`, sampleType: "Duplicate", campaign: "", ni: "1.55" } },
        { line: 2, cells: { sampleId: `${tag}-NEW`, sampleType: "std", date: "01/10/2026", ni: "<0.01" } },
      ],
      false
    );
    expect(body.data).toMatchObject({ created: 1, updated: 1, summary: { create: 1, update: 1, invalid: 0 } });

    const old = await prisma.dataSource.findUniqueOrThrow({ where: { id: stored } });
    expect(old).toMatchObject({ campaign: null, sampleType: "DUPLICATE", ni: "1.55", updatedById: session.userId });

    const added = await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-NEW` } });
    expect(added).toMatchObject({ sampleType: "STANDARD", ni: "<0.01", createdById: session.userId });
    expect(added.date?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("gives a QC list's new rows its type, and leaves the columns it does not show alone", async () => {
    const { body } = await send(
      "standard",
      [
        { line: 1, id: standard, cells: { sampleId: `${tag}-STD`, control: "OREAS-2", ni: "2.1" } },
        { line: 2, cells: { sampleId: `${tag}-STD2`, control: "OREAS-2", ni: "2.2" } },
      ],
      false
    );
    expect(body.data).toMatchObject({ created: 1, updated: 1 });
    // `from` is not a column of the Standard list: changing the row there keeps it.
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: standard } })).toMatchObject({
      control: "OREAS-2",
      ni: "2.1",
      from: "10",
      sampleType: "STANDARD",
    });
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-STD2` } })).toMatchObject({
      sampleType: "STANDARD",
    });
  });

  it("refuses a row of another type on a QC list", async () => {
    const { body } = await send("blank", [{ line: 1, cells: { sampleId: `${tag}-B1`, sampleType: "Duplicate" } }], true);
    expect(body.data.rows[0]).toMatchObject({ status: "invalid", field: "sampleType" });
  });
});
