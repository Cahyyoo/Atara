import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { resetEksplorasiCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import { loadBlankCharts } from "@/modules/eksplorasi/lib/qc-blank-service";
import { blankLimit } from "@/modules/eksplorasi/lib/qc-blank";
import { crmKey } from "@/modules/eksplorasi/lib/qc-control";

/**
 * The blank charts against the real database: only BLANK rows, of the
 * campaign asked for, in the order they came in, against the CRM List's
 * Preferred Value. Skipped when there is no database.
 */

vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => ({ userId: "x", role: "ADMIN", department: "EKSPLORASI" })),
  requireSession: vi.fn(async () => ({ userId: "x", role: "ADMIN", department: "EKSPLORASI" })),
}));
const { GET: blankRoute } = await import("@/app/api/(eksplorasi)/data-sources/qc/blank/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[qc-blank-db] skipped: no database reachable");
}

// Rows are written straight through Prisma here, past the services that empty the caches.
beforeEach(() => resetEksplorasiCaches());

describe.skipIf(!reachable)("the blank charts", () => {
  const tag = `QCB${Date.now().toString(36).toUpperCase()}`;
  const campaign = `${tag}-C`;
  let userId = "";

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { name: "QC blank test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "EKSPLORASI" },
      })
    ).id;
    const row = (suffix: string, sampleType: "FIELD" | "BLANK", ni: string | null, rowCampaign = campaign) => ({
      sampleId: `${tag}-${suffix}`,
      sampleType,
      campaign: rowCampaign,
      ni,
      createdById: userId,
    });
    // One statement, so the rows keep this order.
    await prisma.dataSource.createMany({
      data: [
        row("B1", "BLANK", "<0.01"),
        row("F1", "FIELD", "1.20"),
        row("B2", "BLANK", "0.05"),
        row("B3", "BLANK", "n/a"),
        row("B4", "BLANK", "0.02", `${tag}-OTHER`),
      ],
    });
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("draws only the campaign's blanks, at their place among them", async () => {
    const data = await loadBlankCharts({ campaign });
    expect(data.campaign).toBe(campaign);
    expect(data.campaigns).toEqual(expect.arrayContaining([campaign, `${tag}-OTHER`]));
    const ni = data.elements.find((entry) => entry.element === "ni")!;
    expect(ni.points).toEqual([
      { sampleId: `${tag}-B1`, x: 1, y: 0.01, belowDetection: true },
      { sampleId: `${tag}-B2`, x: 2, y: 0.05, belowDetection: false },
    ]);
    expect(ni.skipped).toBe(1);
    expect(data.elements.map((entry) => entry.element)).toEqual(["ni", "co", "fe2o3", "cr2o3"]);
  });

  it("takes each line from the CRM List's Preferred Value row", async () => {
    // The table's row is shared with the app, so the test reads it rather than writing its own.
    const rows = await prisma.crmBlank.findMany({ orderBy: { createdAt: "asc" } });
    const preferred = rows.find((row) => crmKey(row.label) === "preferredvalue") ?? rows[0];
    const data = await loadBlankCharts({ campaign });
    for (const entry of data.elements) {
      expect(entry.limit).toBe(blankLimit(preferred?.[entry.element]));
    }
  });

  it("refuses a campaign longer than the column holds", async () => {
    const response = await blankRoute(new NextRequest(`http://localhost/api/data-sources/qc/blank?campaign=${"x".repeat(101)}`));
    expect(response.status).toBe(422);
  });
});
