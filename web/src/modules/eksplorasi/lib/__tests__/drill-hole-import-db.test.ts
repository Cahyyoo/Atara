import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/core/lib/prisma";

/**
 * The drilling import at the size it was built for -- 34,000 rows -- against
 * the real database: as CSV and as .xlsx, a preview, the write, a second pass
 * that updates instead of creating, and the export read straight back in.
 * Skipped when there is no database.
 */

const session = {
  userId: "",
  name: "Drill import test",
  email: "",
  role: "ADMIN" as const,
  department: "EKSPLORASI" as const,
  sessionId: "test",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { POST: importRoute } = await import("@/app/api/(eksplorasi)/drill-holes/import/route");
const { GET: exportRoute } = await import("@/app/api/(eksplorasi)/drill-holes/export/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[drill-hole-import-db] skipped: no database reachable");
}

const ROWS = 34_000;
const HEADER = "Hole ID,Area,Status,Easting,Northing,Elevation (m),Azimuth (°),Dip (°),Total Depth (m),Start Date,End Date,Remarks";

function upload(name: string, content: BlobPart, fields: Record<string, string>) {
  const form = new FormData();
  form.set("file", new File([content], name));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest("http://localhost/api/drill-holes/import", { method: "POST", body: form });
}

/** The NDJSON lines an apply streams back. */
async function applyLines(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe.skipIf(!reachable)("importing 34,000 drill holes", () => {
  const tag = `IMP${Date.now().toString(36).toUpperCase()}`;
  const holeId = (i: number) => `${tag}-${String(i).padStart(5, "0")}`;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Drill import test",
        email: `${tag.toLowerCase()}@test.invalid`,
        password: "x",
        role: "ADMIN",
        department: "EKSPLORASI",
      },
    });
    session.userId = user.id;
  });

  afterAll(async () => {
    await prisma.drillHole.deleteMany({ where: { holeId: { startsWith: tag } } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  it("previews and writes a 34,000-row CSV, invalid rows left out", async () => {
    const lines = [HEADER];
    for (let i = 1; i <= ROWS; i += 1) {
      lines.push(
        `${holeId(i)},Blok ${i % 7},Ongoing,${400000 + i}.125,${9600000 + i}.5,${(i % 300) + 0.25},${i % 360},-60,${(i % 500) + 10},2026-01-0${(i % 9) + 1},,"Note, ${i}"`
      );
    }
    // Two broken rows and one hole that appears twice.
    lines.push(`${tag}-BAD1,,Ongoing,not-a-number,,,,,,,,`);
    lines.push(`${tag}-BAD2,,Ongoing,,,,400,,,,,`);
    lines.push(`${holeId(1)},Duplicate,,,,,,,,,,`);
    const csv = lines.join("\r\n");

    const started = Date.now();
    const preview = await importRoute(upload("holes.csv", csv, { apply: "0" }));
    const body = await preview.json();
    expect(preview.status).toBe(200);
    expect(body.data).toMatchObject({ total: ROWS + 3, valid: ROWS, create: ROWS, existing: 0, invalid: 3 });
    expect(body.data.errors.map((e: { line: number }) => e.line)).toEqual([ROWS + 2, ROWS + 3, ROWS + 4]);
    const previewMs = Date.now() - started;

    const applyStarted = Date.now();
    const events = await applyLines(await importRoute(upload("holes.csv", csv, { apply: "1" })));
    const applyMs = Date.now() - applyStarted;
    const done = events.at(-1);
    expect(done).toMatchObject({ phase: "done", created: ROWS, updated: 0, invalid: 3 });
    expect(events.filter((e) => e.phase === "write").length).toBeGreaterThan(10);
    expect(await prisma.drillHole.count({ where: { holeId: { startsWith: tag } } })).toBe(ROWS);

    const sample = await prisma.drillHole.findUnique({ where: { holeId: holeId(42) } });
    expect(sample).toMatchObject({ area: "Blok 0", status: "ONGOING", remarks: "Note, 42" });
    expect(Number(sample!.easting)).toBe(400042.125);
    expect(sample!.startDate?.toISOString().slice(0, 10)).toBe("2026-01-07");

    console.info(`[drill-hole-import] ${ROWS} rows CSV: preview ${previewMs} ms, write ${applyMs} ms`);
    expect(applyMs).toBeLessThan(120_000);
  }, 300_000);

  it("updates the same holes from a 34,000-row .xlsx, blank cells keeping what is stored", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Drill Holes");
    sheet.addRow(["Hole ID", "Status", "Total Depth (m)", "Area", "Tanggal Selesai"]);
    for (let i = 1; i <= ROWS; i += 1) {
      // Area left blank: it must survive. The end date as a real date cell.
      sheet.addRow([holeId(i), "Selesai", 999.5, null, new Date(Date.UTC(2026, 1, 15))]);
    }
    const buffer = await workbook.xlsx.writeBuffer();

    const skipped = await applyLines(await importRoute(upload("holes.xlsx", buffer as ArrayBuffer, { apply: "1" })));
    expect(skipped.at(-1)).toMatchObject({ phase: "done", created: 0, updated: 0, skipped: ROWS });

    const started = Date.now();
    const events = await applyLines(
      await importRoute(upload("holes.xlsx", buffer as ArrayBuffer, { apply: "1", updateExisting: "1" }))
    );
    const ms = Date.now() - started;
    expect(events.at(-1)).toMatchObject({ phase: "done", created: 0, updated: ROWS });

    const hole = await prisma.drillHole.findUnique({ where: { holeId: holeId(42) } });
    expect(hole).toMatchObject({ area: "Blok 0", status: "COMPLETED", updatedById: session.userId });
    expect(Number(hole!.totalDepth)).toBe(999.5);
    expect(Number(hole!.easting)).toBe(400042.125);
    expect(hole!.endDate?.toISOString().slice(0, 10)).toBe("2026-02-15");

    console.info(`[drill-hole-import] ${ROWS} rows XLSX update: ${ms} ms`);
    expect(ms).toBeLessThan(120_000);
  }, 300_000);

  it("reads its own export back without a single error", async () => {
    const response = await exportRoute(
      new NextRequest(`http://localhost/api/drill-holes/export?format=csv&search=${tag}`)
    );
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv.split(/\r?\n/).filter(Boolean).length).toBeGreaterThanOrEqual(ROWS);

    const preview = await importRoute(upload("export.csv", csv, { apply: "0" }));
    const body = await preview.json();
    expect(body.data).toMatchObject({ valid: ROWS, existing: ROWS, create: 0, invalid: 0 });
  }, 300_000);
});
