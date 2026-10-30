import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { resetEksplorasiCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";

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

// Rows are written straight through Prisma here, past the services that empty the caches.
beforeEach(() => resetEksplorasiCaches());

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
        data: { sampleId: `${tag}-OLD`, sampleType: "FIELD", campaign: "C1", ni: "1.5", createdById: user.id },
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
        { line: 2, cells: { sampleId: `${tag}-NEW`, sampleType: "std", date: "01/10/2026", ni: "0.009" } },
        { line: 3, cells: { sampleId: `${tag}-OLD`, sampleType: "FIELD" } },
        { line: 4, cells: { sampleId: `${tag}-BAD`, sampleType: "FIELD", date: "2026-13-01" } },
        { line: 5, cells: { sampleId: `${tag}-NOTYPE` } },
        { line: 6, cells: { sampleId: `${tag}-LT`, sampleType: "BLANK", cr2o3: "<0.01" } },
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
      [6, "invalid"],
    ]);
    // The unlocked row on line 1 already claims that ID on this sheet.
    expect(body.data.rows[2]).toMatchObject({ field: "sampleId", message: expect.stringContaining("line 1") });
    expect(body.data.rows[3]).toMatchObject({ field: "date" });
    expect(body.data.rows[4]).toMatchObject({ field: "sampleType" });
    // A result below the detection limit is entered as the number itself.
    expect(body.data.rows[5]).toMatchObject({ field: "cr2o3", message: expect.stringContaining("<0.01") });
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
        { line: 2, cells: { sampleId: `${tag}-NEW`, sampleType: "std", date: "01/10/2026", ni: "0.009" } },
      ],
      false
    );
    expect(body.data).toMatchObject({ created: 1, updated: 1, summary: { create: 1, update: 1, invalid: 0 } });

    const old = await prisma.dataSource.findUniqueOrThrow({ where: { id: stored } });
    expect(old).toMatchObject({ campaign: null, sampleType: "DUPLICATE", ni: "1.55", updatedById: session.userId });

    const added = await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-NEW` } });
    expect(added).toMatchObject({ sampleType: "STANDARD", ni: "0.009", createdById: session.userId });
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

  it("writes each list's Remarks to its own column, the other list's left as it was", async () => {
    const dup = (
      await prisma.dataSource.create({
        data: { sampleId: `${tag}-DUP`, sampleType: "DUPLICATE", oreasRemarks: "OREAS note", createdById: session.userId! },
      })
    ).id;
    // The original a duplicate's Remarks names: a FIELD sample.
    await prisma.dataSource.create({ data: { sampleId: `${tag}-ORIG`, sampleType: "FIELD", createdById: session.userId! } });

    // The Duplicate list's Remarks names the original sample -- case aside, as the dashboard pairs them.
    const duplicate = await send(
      "duplicate",
      [
        { line: 1, id: dup, cells: { sampleId: `${tag}-DUP`, originalSampleIdRemarks: `${tag}-ORIG` } },
        { line: 2, cells: { sampleId: `${tag}-DUP2`, originalSampleIdRemarks: `${tag}-orig`.toLowerCase() } },
      ],
      false
    );
    expect(duplicate.body.data).toMatchObject({ created: 1, updated: 1 });
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: dup } })).toMatchObject({
      originalSampleIdRemarks: `${tag}-ORIG`,
      oreasRemarks: "OREAS note",
    });
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-DUP2` } })).toMatchObject({
      originalSampleIdRemarks: `${tag}-orig`.toLowerCase(),
      oreasRemarks: null,
    });

    // Anything else there -- a note, another list's sample -- is refused at its box, and nothing is written.
    const refused = await send(
      "duplicate",
      [
        { line: 1, cells: { sampleId: `${tag}-DUP3`, originalSampleIdRemarks: "Repeats DH-3 12 m" } },
        { line: 2, cells: { sampleId: `${tag}-DUP4`, originalSampleIdRemarks: `${tag}-STD` } },
      ],
      false
    );
    expect(refused.body.data).toMatchObject({ created: 0, summary: { invalid: 2 } });
    expect(refused.body.data.rows).toEqual([
      expect.objectContaining({ line: 1, status: "invalid", field: "originalSampleIdRemarks" }),
      expect.objectContaining({ line: 2, status: "invalid", field: "originalSampleIdRemarks" }),
    ]);

    // The Standard list's is the OREAS remarks; the duplicate's own stays untouched.
    await send(
      "standard",
      [{ line: 1, id: standard, cells: { sampleId: `${tag}-STD`, control: "OREAS-2", oreasRemarks: "CRM ok", ni: "2.1" } }],
      false
    );
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { id: standard } })).toMatchObject({
      oreasRemarks: "CRM ok",
      originalSampleIdRemarks: null,
    });
  });

  it("refuses a row of another type on a QC list", async () => {
    const { body } = await send("blank", [{ line: 1, cells: { sampleId: `${tag}-B1`, sampleType: "Duplicate" } }], true);
    expect(body.data.rows[0]).toMatchObject({ status: "invalid", field: "sampleType" });
  });
});

describe.skipIf(!reachable)("a row whose assay is an OREAS standard's", () => {
  const tag = `ORM${Date.now().toString(36).toUpperCase()}`;
  const oreas = `Oreas${tag}`;
  /** Values no seeded standard has, so only this test's can match. */
  const ASSAY = { ni: "9.1234", co: "8.4321", fe2o3: "77.77", al2o3: "6.66", cr2o3: "5.55" };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "OREAS remarks test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "EKSPLORASI" },
    });
    session.userId = user.id;
    await prisma.crmStandard.create({ data: { standard: oreas, testMethod: "Fusion XRF", ...ASSAY, createdById: user.id } });
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    await prisma.crmStandard.deleteMany({ where: { standard: oreas } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  const remarkOf = async (suffix: string) =>
    (await prisma.dataSource.findUnique({ where: { sampleId: `${tag}-${suffix}` } }))?.oreasRemarks ?? null;

  it("gets the standard's name as its Remarks when it has none", async () => {
    const { body } = await send(
      "dataSource",
      [{ line: 1, cells: { sampleId: `${tag}-AUTO`, sampleType: "STANDARD", ...ASSAY, ni: "9.12340" } }],
      false
    );
    expect(body.data).toMatchObject({ created: 1 });
    expect(await remarkOf("AUTO")).toBe(oreas);
  });

  it("keeps a Remarks somebody wrote", async () => {
    await send(
      "standard",
      [{ line: 1, cells: { sampleId: `${tag}-KEPT`, oreasRemarks: "Checked by hand", ...ASSAY } }],
      false
    );
    expect(await remarkOf("KEPT")).toBe("Checked by hand");
  });

  it("fills a stored row that had none once its values are the standard's", async () => {
    await send("dataSource", [{ line: 1, cells: { sampleId: `${tag}-LATER`, sampleType: "STANDARD", ni: "1" } }], false);
    expect(await remarkOf("LATER")).toBeNull();
    const id = (await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-LATER` } })).id;
    const { body } = await send(
      "dataSource",
      [{ line: 1, id, cells: { sampleId: `${tag}-LATER`, sampleType: "STANDARD", ...ASSAY } }],
      false
    );
    expect(body.data).toMatchObject({ updated: 1 });
    expect(await remarkOf("LATER")).toBe(oreas);
  });

  it("leaves a duplicate's Remarks alone", async () => {
    await send(
      "duplicate",
      [{ line: 1, cells: { sampleId: `${tag}-DUP`, control: `${tag}-AUTO`, ...ASSAY } }],
      false
    );
    const row = await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-DUP` } });
    expect(row.oreasRemarks).toBeNull();
    expect(row.originalSampleIdRemarks).toBeNull();
  });
});

describe.skipIf(!reachable)("what the module holds between requests", () => {
  const tag = `HLD${Date.now().toString(36).toUpperCase()}`;
  let userId = "";

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { name: "Cache test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "EKSPLORASI" },
      })
    ).id;
    session.userId = userId;
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    await prisma.crmStandard.deleteMany({ where: { standard: { startsWith: tag } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("keeps the campaigns until the data source is written through the app, then reads them afresh", async () => {
    const { listCampaigns } = await import("@/modules/eksplorasi/lib/data-source-service");
    expect(await listCampaigns()).not.toContain(`${tag}-A`);
    // Written past the app: what is held does not know yet.
    await prisma.dataSource.create({ data: { sampleId: `${tag}-A`, sampleType: "FIELD", campaign: `${tag}-A`, createdById: userId } });
    expect(await listCampaigns()).not.toContain(`${tag}-A`);

    // A dry run writes nothing, and empties nothing.
    await send("dataSource", [{ line: 1, cells: { sampleId: `${tag}-B`, sampleType: "FIELD", campaign: `${tag}-B` } }], true);
    expect(await listCampaigns()).not.toContain(`${tag}-A`);

    // A save through the sheet does both.
    const saved = await send("dataSource", [{ line: 1, cells: { sampleId: `${tag}-B`, sampleType: "FIELD", campaign: `${tag}-B` } }], false);
    expect(saved.body.data.created).toBe(1);
    expect(await listCampaigns()).toEqual(expect.arrayContaining([`${tag}-A`, `${tag}-B`]));
  });

  it("keeps the OREAS values until the CRM List is written through the app", async () => {
    const { createCrm, oreasStandards } = await import("@/modules/eksplorasi/lib/crm-list-service");
    const names = async () => (await oreasStandards()).map((row) => row.standard);
    expect(await names()).not.toContain(`${tag}-ORE`);
    await createCrm("standard", { standard: `${tag}-ORE`, testMethod: "Fusion XRF", ni: "1.00" }, userId);
    expect(await names()).toContain(`${tag}-ORE`);
  });
});
