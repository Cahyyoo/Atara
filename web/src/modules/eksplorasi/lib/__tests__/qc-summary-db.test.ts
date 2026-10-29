import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { resetEksplorasiCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import { loadStandardControl, saveStandardRemark } from "@/modules/eksplorasi/lib/qc-control-service";
import { loadDuplicateCharts } from "@/modules/eksplorasi/lib/qc-duplicate-service";

/**
 * The dashboard's tables against the real database: the standard table and
 * control charts of one campaign, the Remarks written on a standard, and the
 * duplicates of one campaign and month. Skipped when there is no database.
 */

vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => ({ userId: "x", role: "ADMIN", department: "EKSPLORASI" })),
  requireSession: vi.fn(async () => ({ userId: "x", role: "ADMIN", department: "EKSPLORASI" })),
}));
const { GET: duplicatesRoute } = await import("@/app/api/(eksplorasi)/data-sources/qc/duplicates/route");
const { PUT: remarksRoute } = await import("@/app/api/(eksplorasi)/data-sources/qc/standard-remarks/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[qc-summary-db] skipped: no database reachable");
}

// Rows are written straight through Prisma here, past the services that empty the caches.
beforeEach(() => resetEksplorasiCaches());

describe.skipIf(!reachable)("the dashboard's tables", () => {
  const tag = `QCS${Date.now().toString(36).toUpperCase()}`;
  const crmName = `Oreas${tag}`;
  const campaignA = `${tag}-A`;
  const campaignB = `${tag}-B`;
  let userId = "";

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { name: "QC summary test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "EKSPLORASI" },
      })
    ).id;
    await prisma.crmStandard.create({
      data: { standard: crmName, testMethod: "Fusion XRF", ni: "1.00", sdNi: "0.10", createdById: userId },
    });
    const row = (
      suffix: string,
      sampleType: "FIELD" | "STANDARD" | "DUPLICATE",
      campaign: string,
      ni: string,
      date: string,
      remarks?: string
    ) => ({
      sampleId: `${tag}-${suffix}`,
      sampleType,
      campaign,
      control: sampleType === "STANDARD" ? `OREAS-${tag}` : null,
      ni,
      date: new Date(`${date}T00:00:00Z`),
      originalSampleIdRemarks: remarks ?? null,
      createdById: userId,
    });
    await prisma.dataSource.createMany({
      data: [
        row("S1", "STANDARD", campaignA, "1.00", "2026-09-10"),
        row("S2", "STANDARD", campaignA, "1.25", "2026-09-11"),
        row("S3", "STANDARD", campaignB, "1.05", "2026-10-02"),
        row("F1", "FIELD", campaignA, "2.00", "2026-09-10"),
        row("D1", "DUPLICATE", campaignA, "2.10", "2026-09-12", `${tag}-F1`),
        row("D2", "DUPLICATE", campaignA, "1.90", "2026-10-05", `${tag}-F1`),
      ],
    });
  });

  afterAll(async () => {
    await prisma.qcStandardRemark.deleteMany({ where: { standardKey: crmName.toLowerCase() } });
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    await prisma.crmStandard.deleteMany({ where: { standard: crmName } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  const niRow = async (campaign?: string) =>
    (await loadStandardControl({ standard: crmName, campaign })).summary
      .find((entry) => entry.element === "ni")!
      .rows.find((row) => row.standard === crmName)!;

  it("works out a standard's row from its assays of the campaign asked for", async () => {
    // 1.00 is on the value, 1.25 is 2.5 SD off: one of two within 2 SD.
    expect(await niRow(campaignA)).toMatchObject({ certified: 1, sd: 0.1, n: 2, within2: 0.5, outside2: 0.5 });
    expect((await niRow()).n).toBe(3);

    const data = await loadStandardControl({ standard: crmName, campaign: campaignB });
    expect(data.campaign).toBe(campaignB);
    expect(data.campaigns).toEqual(expect.arrayContaining([campaignA, campaignB]));
    expect(data.elements.find((entry) => entry.element === "ni")!.points.map((point) => point.sampleId)).toEqual([`${tag}-S3`]);
  });

  it("keeps the Remarks written on a standard, whatever its spelling, until they are emptied", async () => {
    // Read first, so the answer is held: the writes below must empty it.
    expect((await niRow(campaignA)).remarks).toBeNull();
    await saveStandardRemark({ standard: `OREAS-${tag}`, element: "ni", remarks: "  Bias on the high side  " }, userId);
    expect((await niRow(campaignA)).remarks).toBe("Bias on the high side");
    expect((await niRow(campaignB)).remarks).toBe("Bias on the high side");

    await saveStandardRemark({ standard: crmName, element: "ni", remarks: "" }, userId);
    expect((await niRow(campaignA)).remarks).toBeNull();
  });

  it("refuses Remarks longer than the column holds, or an element with no chart", async () => {
    const put = (body: unknown) =>
      remarksRoute(new NextRequest("http://localhost/api/data-sources/qc/standard-remarks", { method: "PUT", body: JSON.stringify(body) }));
    expect((await put({ standard: crmName, element: "ni", remarks: "x".repeat(501) })).status).toBe(422);
    expect((await put({ standard: crmName, element: "au", remarks: "x" })).status).toBe(422);
  });

  it("pairs only the duplicates of the campaign and month asked for", async () => {
    const pairsOf = async (query: { campaign?: string; month?: string }) =>
      (await loadDuplicateCharts(query)).elements
        .find((entry) => entry.element === "ni")!
        .pairs.filter((pair) => pair.sampleId.startsWith(tag))
        .map((pair) => pair.sampleId);
    expect(await pairsOf({ campaign: campaignA })).toEqual([`${tag}-D1`, `${tag}-D2`]);
    expect(await pairsOf({ campaign: campaignA, month: "2026-09" })).toEqual([`${tag}-D1`]);
    expect(await pairsOf({ campaign: campaignB })).toEqual([]);

    const data = await loadDuplicateCharts({ campaign: campaignA, month: "2026-10" });
    expect(data).toMatchObject({ campaign: campaignA, month: "2026-10" });
    expect(data.months).toEqual(expect.arrayContaining(["2026-09", "2026-10"]));
  });

  it("refuses a month that is not YYYY-MM", async () => {
    const response = await duplicatesRoute(new NextRequest("http://localhost/api/data-sources/qc/duplicates?month=2026-13"));
    expect(response.status).toBe(422);
  });
});
