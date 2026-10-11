import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { stageColumnKey } from "@/lib/export-columns";

/**
 * Both exports with the columns chosen: only those columns, each stage's
 * entry time, hours and operator from the scan log, and an identity column as
 * its code. Against the real database; skipped when there is none.
 */

const session = { userId: "", name: "Export test", email: "", role: "ADMIN" as const, department: "LAB" as const, sessionId: "test" };
vi.mock("@/lib/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { GET: exportRecords } = await import("@/app/api/lab-records/export/route");
const { GET: exportSamples } = await import("@/app/api/samples/export/route");

/** The CSV as rows of cells; the cells here hold no commas or quotes. */
async function csvOf(handler: (request: NextRequest) => Promise<Response>, url: string) {
  const response = await handler(new NextRequest(`http://localhost${url}`));
  expect(response.status).toBe(200);
  const text = (await response.text()).replace(/^﻿/, "");
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "")));
}

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[export-stages] skipped: no database reachable");
}

describe.skipIf(!reachable)("exports with chosen columns", () => {
  const tag = `X${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { sample: "", option: "", user: "" };
  let first = { id: "", name: "" };
  let second = { id: "", name: "" };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: `${tag} Operator`, email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "OPERATOR", department: "LAB" as const },
    });
    created.user = user.id;
    session.userId = user.id;
    const stages = await prisma.stage.findMany({ orderBy: { sequenceOrder: "asc" }, take: 2 });
    [first, second] = stages.map((stage) => ({ id: stage.id, name: stage.name }));
    const pit = await prisma.masterOption.create({ data: { kind: "PIT", code: `${tag}P` } });
    created.option = pit.id;

    const sample = await prisma.sample.create({
      data: {
        sampleCode: `${tag}-1`,
        status: "IN_PROGRESS",
        createdById: user.id,
        currentStageId: second.id,
        logs: {
          create: [
            { stageId: first.id, operatorId: user.id, scannedAt: new Date("2026-10-05T00:00:00Z") },
            { stageId: second.id, operatorId: user.id, scannedAt: new Date("2026-10-05T03:30:00Z") },
          ],
        },
      },
    });
    created.sample = sample.id;
    await prisma.labRecord.create({
      data: {
        sampleId: sample.id,
        labCode: `${tag}.1`,
        shiftDate: new Date("2000-01-04T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + 1,
        pitId: pit.id,
        sampleIdent: `${tag}/P${tag}P/1`,
      },
    });
  });

  afterAll(async () => {
    if (created.sample) await prisma.sample.delete({ where: { id: created.sample } });
    if (created.option) await prisma.masterOption.delete({ where: { id: created.option } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
  });

  it("gives the Sample Database only the chosen columns, stages and identity included", async () => {
    const columns = ["labCode", "pit", stageColumnKey(first.id, "at"), stageColumnKey(first.id, "duration"), stageColumnKey(first.id, "by")];
    const rows = await csvOf(
      exportRecords,
      `/api/lab-records/export?format=csv&search=${tag}&columns=${encodeURIComponent(columns.join(","))}`
    );

    expect(rows[0]).toEqual([
      "Lab Code",
      `Entered ${first.name}`,
      `Hours in ${first.name}`,
      `Operator ${first.name}`,
      "Pit",
    ]);
    // 00:00 UTC is 08:00 on the lab's clock; 3.5 hours until the next scan.
    expect(rows[1][0]).toBe(`${tag}.1`);
    expect(rows[1][1]).toContain("08:00");
    expect(rows[1][2]).toBe("3.5");
    expect(rows[1][3]).toBe(`${tag} Operator`);
    expect(rows[1][4]).toBe(`${tag}P`);
  });

  it("gives the Dashboard sample list its chosen columns too", async () => {
    const columns = ["sampleCode", stageColumnKey(second.id, "at"), stageColumnKey(second.id, "by")];
    const rows = await csvOf(
      exportSamples,
      `/api/samples/export?format=csv&search=${tag}&columns=${encodeURIComponent(columns.join(","))}`
    );
    expect(rows[0]).toEqual(["Barcode Code", `Entered ${second.name}`, `Operator ${second.name}`]);
    expect(rows[1][0]).toBe(`${tag}-1`);
    expect(rows[1][1]).toContain("11:30");
    expect(rows[1][2]).toBe(`${tag} Operator`);
  });

  it("still gives the old sheet to a link that chooses nothing", async () => {
    const rows = await csvOf(exportSamples, `/api/samples/export?format=csv&search=${tag}`);
    expect(rows[0]).toEqual([
      "Barcode Code",
      "Lab Code",
      "Sample ID",
      "Current Stage",
      "Status",
      "Created By",
      "Created At",
      "Last Updated",
    ]);
  });
});
