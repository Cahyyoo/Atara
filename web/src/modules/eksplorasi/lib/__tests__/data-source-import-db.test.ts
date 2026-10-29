import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/core/lib/prisma";
import { resetEksplorasiCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";

/**
 * The data-source import at the size it was built for -- 34,000 rows --
 * against the real database: as CSV and as .xlsx, a preview, the write, a
 * second pass that updates instead of creating, a QC list's file without a
 * type column, and an export read straight back in. Skipped when there is no
 * database.
 */

const session = {
  userId: "",
  name: "Data source import test",
  email: "",
  role: "ADMIN" as const,
  department: "EKSPLORASI" as const,
  sessionId: "test",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { POST: importRoute } = await import("@/app/api/(eksplorasi)/data-sources/import/route");
const { GET: exportRoute } = await import("@/app/api/(eksplorasi)/data-sources/export/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[data-source-import-db] skipped: no database reachable");
}

const ROWS = 34_000;
const HEADER = "Campaign,Hole ID,Sample ID,Sample Type,From,To,Date,Weight,Ni,Fe,SiO2,Remarks";
const TYPES = ["FIELD", "STANDARD", "BLANK", "DUPLICATE"] as const;

function upload(name: string, content: BlobPart, fields: Record<string, string>) {
  const form = new FormData();
  form.set("file", new File([content], name));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest("http://localhost/api/data-sources/import", { method: "POST", body: form });
}

/** The NDJSON lines an apply streams back. */
async function applyLines(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// Rows are written straight through Prisma here, past the services that empty the caches.
beforeEach(() => resetEksplorasiCaches());

describe.skipIf(!reachable)("importing 34,000 rows of the data source", () => {
  const tag = `IMP${Date.now().toString(36).toUpperCase()}`;
  const sampleId = (i: number) => `${tag}-${String(i).padStart(5, "0")}`;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "Data source import test",
        email: `${tag.toLowerCase()}@test.invalid`,
        password: "x",
        role: "ADMIN",
        department: "EKSPLORASI",
      },
    });
    session.userId = user.id;
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  it("previews and writes a 34,000-row CSV of every type, invalid rows left out", async () => {
    const lines = [HEADER];
    for (let i = 1; i <= ROWS; i += 1) {
      lines.push(
        `C${i % 3},DH-${i % 50},${sampleId(i)},${TYPES[i % 4]},${i % 100}.0,${(i % 100) + 1}.0,2026-01-0${(i % 9) + 1},2.${i % 10},1.${i % 90},4${i % 10}.5,<0.01,"Note, ${i}"`
      );
    }
    // A date that is not one, a type that is not one, and a sample that appears twice.
    lines.push(`C1,DH-1,${tag}-BAD1,ORIGINAL,,,31/02/2026,,,,,`);
    lines.push(`C1,DH-1,${tag}-BAD2,REFERENCE,,,,,,,,`);
    lines.push(`C1,DH-1,${sampleId(1)},ORIGINAL,,,,,,,,`);
    const csv = lines.join("\r\n");

    const started = Date.now();
    const preview = await importRoute(upload("data.csv", csv, { apply: "0", view: "dataSource" }));
    const body = await preview.json();
    expect(preview.status).toBe(200);
    expect(body.data).toMatchObject({ total: ROWS + 3, valid: ROWS, create: ROWS, existing: 0, invalid: 3 });
    expect(body.data.errors.map((e: { line: number; field: string }) => [e.line, e.field])).toEqual([
      [ROWS + 2, "date"],
      [ROWS + 3, "sampleType"],
      [ROWS + 4, "sampleId"],
    ]);
    const previewMs = Date.now() - started;

    const applyStarted = Date.now();
    const events = await applyLines(await importRoute(upload("data.csv", csv, { apply: "1", view: "dataSource" })));
    const applyMs = Date.now() - applyStarted;
    expect(events.at(-1)).toMatchObject({ phase: "done", created: ROWS, updated: 0, invalid: 3 });
    expect(events.filter((e) => e.phase === "write").length).toBeGreaterThan(10);
    expect(await prisma.dataSource.count({ where: { sampleId: { startsWith: tag } } })).toBe(ROWS);

    const row = await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: sampleId(42) } });
    expect(row).toMatchObject({
      campaign: "C0",
      holeId: "DH-42",
      sampleType: "BLANK",
      from: "42.0",
      to: "43.0",
      weight: "2.2",
      ni: "1.42",
      fe: "42.5",
      sio2: "<0.01",
      // The data source's Remarks is the OREAS remarks column.
      oreasRemarks: "Note, 42",
      originalSampleIdRemarks: null,
    });
    expect(row.date?.toISOString().slice(0, 10)).toBe("2026-01-07");

    console.info(`[data-source-import] ${ROWS} rows CSV: preview ${previewMs} ms, write ${applyMs} ms`);
    expect(applyMs).toBeLessThan(120_000);
  }, 300_000);

  it("updates the same rows from a 34,000-row .xlsx, blank cells keeping what is stored", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data Source");
    sheet.addRow(["Sample ID", "Sample Type", "Ni (%)", "From", "Remarks", "Tanggal"]);
    for (let i = 1; i <= ROWS; i += 1) {
      // Remarks left blank: they must survive. The date as a real date cell, Ni as a number.
      sheet.addRow([sampleId(i), TYPES[i % 4], 2.25, "7.5", null, new Date(Date.UTC(2026, 1, 15))]);
    }
    const buffer = await workbook.xlsx.writeBuffer();

    const skipped = await applyLines(
      await importRoute(upload("data.xlsx", buffer as ArrayBuffer, { apply: "1", view: "dataSource" }))
    );
    expect(skipped.at(-1)).toMatchObject({ phase: "done", created: 0, updated: 0, skipped: ROWS });

    const started = Date.now();
    const events = await applyLines(
      await importRoute(upload("data.xlsx", buffer as ArrayBuffer, { apply: "1", view: "dataSource", updateExisting: "1" }))
    );
    const ms = Date.now() - started;
    expect(events.at(-1)).toMatchObject({ phase: "done", created: 0, updated: ROWS });

    const row = await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: sampleId(42) } });
    // `from` is a reserved word: written through the quoted column.
    expect(row).toMatchObject({ ni: "2.25", from: "7.5", to: "43.0", oreasRemarks: "Note, 42", updatedById: session.userId });
    expect(row.date?.toISOString().slice(0, 10)).toBe("2026-02-15");

    console.info(`[data-source-import] ${ROWS} rows XLSX update: ${ms} ms`);
    expect(ms).toBeLessThan(120_000);
  }, 300_000);

  it("takes a QC list's file without a type column, and refuses a row of another type", async () => {
    const csv = ["Control,Sample ID,Sample Type,Ni", `OREAS-1,${tag}-STD1,,1.5`, `OREAS-1,${tag}-STD2,Blank,1.6`].join("\n");
    const preview = await (await importRoute(upload("std.csv", csv, { apply: "0", view: "standard" }))).json();
    expect(preview.data).toMatchObject({ valid: 1, invalid: 1 });
    expect(preview.data.errors[0]).toMatchObject({ line: 3, field: "sampleType" });

    const noType = ["Control,Sample ID,Ni", `OREAS-2,${tag}-STD3,1.7`].join("\n");
    const events = await applyLines(await importRoute(upload("std.csv", noType, { apply: "1", view: "standard" })));
    expect(events.at(-1)).toMatchObject({ phase: "done", created: 1 });
    expect(await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-STD3` } })).toMatchObject({
      sampleType: "STANDARD",
      control: "OREAS-2",
    });

    // The data source's own file names each row's type.
    const refused = await importRoute(upload("data.csv", noType, { apply: "0", view: "dataSource" }));
    expect(refused.status).toBe(422);
  });

  /**
   * The OREAS Remarks fill, as an import applies it: the file's own Remarks
   * first, then what is stored, and only then the standard the values match.
   */
  it("fills Remarks with the OREAS standard a row's values are, never over one already there", async () => {
    const oreas = `Oreas${tag}`;
    // Values no seeded standard has, so only this one can match.
    const assay = { ni: "9.1234", co: "8.4321", fe2o3: "77.77", al2o3: "6.66", cr2o3: "5.55" };
    await prisma.crmStandard.create({ data: { standard: oreas, testMethod: "Fusion XRF", ...assay, createdById: session.userId } });
    try {
      await prisma.dataSource.createMany({
        data: [
          { sampleId: `${tag}-OR-KEEP`, sampleType: "STANDARD", oreasRemarks: "Stored", createdById: session.userId },
          { sampleId: `${tag}-OR-FILL`, sampleType: "STANDARD", createdById: session.userId },
        ],
      });
      const values = `${assay.ni},${assay.co},${assay.fe2o3},${assay.al2o3},${assay.cr2o3}`;
      const csv = [
        "Sample ID,Ni,Co,Fe2O3,Al2O3,Cr2O3,Remarks",
        `${tag}-OR-NEW,${values},`,
        `${tag}-OR-OWN,${values},From the file`,
        `${tag}-OR-KEEP,${values},`,
        `${tag}-OR-FILL,${values},`,
        `${tag}-OR-NONE,1.0,${assay.co},${assay.fe2o3},${assay.al2o3},${assay.cr2o3},`,
      ].join("\n");
      const events = await applyLines(
        await importRoute(upload("std.csv", csv, { apply: "1", view: "standard", updateExisting: "1" }))
      );
      expect(events.at(-1)).toMatchObject({ phase: "done", created: 3, updated: 2 });

      const remark = async (suffix: string) =>
        (await prisma.dataSource.findUniqueOrThrow({ where: { sampleId: `${tag}-${suffix}` } })).oreasRemarks;
      expect(await remark("OR-NEW")).toBe(oreas);
      expect(await remark("OR-OWN")).toBe("From the file");
      expect(await remark("OR-KEEP")).toBe("Stored");
      expect(await remark("OR-FILL")).toBe(oreas);
      expect(await remark("OR-NONE")).toBeNull();
    } finally {
      // Gone before the next test, which counts each list's rows.
      await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: `${tag}-OR-` } } });
      await prisma.crmStandard.deleteMany({ where: { standard: oreas } });
    }
  });

  it("reads each list's export back into that list without a single error", async () => {
    for (const view of ["dataSource", "blank"] as const) {
      const response = await exportRoute(
        new NextRequest(`http://localhost/api/data-sources/export?format=csv&view=${view}&search=${tag}`)
      );
      expect(response.status).toBe(200);
      const csv = await response.text();
      const expected = view === "blank" ? ROWS / 4 : ROWS + 1;
      expect(csv.split(/\r?\n/).filter(Boolean).length - 1, view).toBe(expected);

      const preview = await importRoute(upload("export.csv", csv, { apply: "0", view }));
      const body = await preview.json();
      expect(body.data, view).toMatchObject({ valid: expected, existing: expected, create: 0, invalid: 0 });
    }
  }, 300_000);
});
