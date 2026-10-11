import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";

/**
 * The moisture-content weighing, end to end: typed in the record dialog,
 * pasted by Sample ID, and reported on the Formulir Analysis Result with the
 * analyst who entered the results. Against the real database; skipped when
 * there is none.
 */

const session = { userId: "", name: "Database test", email: "", role: "DATABASE" as const, department: "LAB" as const, sessionId: "test" };
vi.mock("@/lib/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { PATCH: editRecord } = await import("@/app/api/lab-records/[id]/route");
const { POST: pasteWeights } = await import("@/app/api/lab-records/weights/route");
const { GET: exportRecords } = await import("@/app/api/lab-records/export/route");

function json(url: string, method: string, body: unknown) {
  const text = JSON.stringify(body);
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: text,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
  });
}

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[mc-weights-export] skipped: no database reachable");
}

describe.skipIf(!reachable)("the moisture-content weighing and the analysis form", () => {
  const tag = `MC${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { users: [] as string[], samples: [] as string[], option: "" };
  const records: { id: string; ident: string }[] = [];

  beforeAll(async () => {
    const database = await prisma.user.create({
      data: { name: `${tag} Database`, email: `${tag.toLowerCase()}-db@test.invalid`, password: "x", role: "DATABASE", department: "LAB" as const },
    });
    const analyst = await prisma.user.create({
      data: { name: `${tag} Analyst`, email: `${tag.toLowerCase()}-an@test.invalid`, password: "x", role: "ANALISIS", department: "LAB" as const },
    });
    created.users.push(database.id, analyst.id);
    session.userId = database.id;

    let place = await prisma.masterOption.findFirst({ where: { kind: "PLACE", code: "MOL" } });
    if (!place) {
      place = await prisma.masterOption.create({ data: { kind: "PLACE", code: "MOL" } });
      created.option = place.id;
    }
    const placeId = place.id;
    const stages = await prisma.stage.findMany();
    const wetPrep = stages.find((stage) => stage.key === "WET_PREP")!;
    const report = stages.find((stage) => stage.key === "REPORT")!;

    for (const sampleNo of [1, 2]) {
      const sample = await prisma.sample.create({
        data: {
          sampleCode: `${tag}-${sampleNo}`,
          status: "COMPLETED",
          createdById: database.id,
          currentStageId: report.id,
          logs: {
            create: [
              // 09:00 on 17 Dec and 08:00 on 19 Dec, on the lab's clock.
              { stageId: wetPrep.id, operatorId: database.id, scannedAt: new Date("2000-12-17T01:00:00Z") },
              { stageId: report.id, operatorId: database.id, scannedAt: new Date("2000-12-19T00:00:00Z") },
            ],
          },
        },
      });
      created.samples.push(sample.id);
      // As the parts compose it, which every write keeps it to.
      const ident = `MOL/B${tag}/779.${sampleNo}`;
      const record = await prisma.labRecord.create({
        data: {
          sampleId: sample.id,
          labCode: `${tag}.${sampleNo}`,
          shiftDate: new Date("2000-12-17T00:00:00Z"),
          sequence: (Date.now() % 100_000) * 100 + sampleNo,
          placeId,
          bargingNo: tag,
          sequenceNo: 779,
          sampleNo,
          sampleIdent: ident,
          sio2: 33.02,
          mgo: 8.37,
          measurementMethod: "STARGATE_LG-GEO",
          xrayInstrument: "S2 PUMA",
        },
      });
      records.push({ id: record.id, ident });
      // The analyst entered the results.
      await prisma.labRecordAudit.create({
        data: { labRecordId: record.id, changedById: analyst.id, changes: { ni: { from: null, to: 1.23 } } },
      });
    }
  });

  afterAll(async () => {
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.labRecordAudit.deleteMany({ where: { changedById: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    if (created.option) await prisma.masterOption.delete({ where: { id: created.option } });
  });

  it("takes the weighing in the record dialog, but not one that cannot be", async () => {
    const params = { params: Promise.resolve({ id: records[0].id }) };
    const wrong = await editRecord(json(`/api/lab-records/${records[0].id}`, "PATCH", { wp: 579, w0: 2810, wd: 2900 }), params);
    expect(wrong.status).toBe(422);

    const right = await editRecord(json(`/api/lab-records/${records[0].id}`, "PATCH", { wp: 579, w0: 2810, wd: 1922 }), params);
    expect(right.status).toBe(200);
    expect((await right.json()).data).toMatchObject({ wp: 579, w0: 2810, wd: 1922 });
    const audit = await prisma.labRecordAudit.findFirst({
      where: { labRecordId: records[0].id, changedById: session.userId },
    });
    expect(audit?.changes).toMatchObject({ wd: { from: null, to: 1922 } });
  });

  it("checks a pasted block first, then saves only the rows that change something", async () => {
    const rows = [
      { line: 1, key: records[1].ident, wp: 564.5, w0: 3131.5, wd: 2276 },
      { line: 2, key: `MOL/B${tag}/999.1`, wp: 1, w0: 2, wd: 1.5 },
      { line: 3, key: records[0].ident, wd: 3000 },
    ];
    const checked = await pasteWeights(json("/api/lab-records/weights", "POST", { rows, dryRun: true }));
    expect(checked.status).toBe(200);
    const preview = (await checked.json()).data;
    expect(preview.rows.map((row: { status: string }) => row.status)).toEqual(["update", "unknown", "invalid"]);
    expect(preview.rows[0].mc.toFixed(2)).toBe("33.33");
    // Not found, but the numbers were read all the same.
    expect(preview.rows[1].to).toEqual({ wp: 1, w0: 2, wd: 1.5 });
    expect((await prisma.labRecord.findUniqueOrThrow({ where: { id: records[1].id } })).wp).toBeNull();

    const saved = await pasteWeights(json("/api/lab-records/weights", "POST", { rows, dryRun: false }));
    expect((await saved.json()).data.saved).toBe(1);
    const stored = await prisma.labRecord.findUniqueOrThrow({ where: { id: records[1].id } });
    expect([Number(stored.wp), Number(stored.w0), Number(stored.wd)]).toEqual([564.5, 3131.5, 2276]);
    // The invalid row left the first record's weighing alone.
    expect(Number((await prisma.labRecord.findUniqueOrThrow({ where: { id: records[0].id } })).wd)).toBe(1922);
  });

  it("reports both on the Molore form, with the analyst, the lead time and the batch's average", async () => {
    const response = await exportRecords(new NextRequest(`http://localhost/api/lab-records/export?format=xlsx&search=${tag}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("formulir-analysis-result");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await response.arrayBuffer()) as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("MOL. Prod.")!;
    const headers = (sheet.getRow(5).values as unknown[]).map((value) => (value == null ? null : String(value)));
    const column = (header: string) => headers.indexOf(header);

    expect(sheet.getRow(6).getCell(column("Sample")).value).toBe(records[0].ident);
    expect(sheet.getRow(7).getCell(column("Sample")).value).toBe(records[1].ident);
    expect(sheet.getRow(6).getCell(column("Operator")).value).toBe(`${tag} Analyst`);
    expect(sheet.getRow(6).getCell(column("Xray Instrument")).value).toBe("S2 PUMA");
    expect(sheet.getRow(6).getCell(column("Days")).value).toBe(2);
    // Wet preparation at 09:00 on the lab's clock, time included.
    const weighed = sheet.getRow(6).getCell(column("Tanggal"));
    expect((weighed.value as Date).toISOString()).toBe("2000-12-17T09:00:00.000Z");
    expect(weighed.numFmt).toBe("d-mmm-yy hh:mm");    expect((sheet.getRow(6).getCell(column("MC")).value as { result: number }).result.toFixed(2)).toBe("39.80");
    // The batch's average, MC of 39.80 and 33.33.
    expect((sheet.getRow(8).getCell(column("MC")).value as { result: number }).result.toFixed(2)).toBe("36.56");
  });
});
