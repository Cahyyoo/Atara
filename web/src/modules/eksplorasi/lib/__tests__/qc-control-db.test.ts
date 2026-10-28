import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { loadStandardControl } from "@/modules/eksplorasi/lib/qc-control-service";

/**
 * The control charts against the real database: a standard's assays found
 * under the data source's spelling of its name, placed at their row in the
 * data source, against the CRM List's lines -- and a date filter thinning the
 * points without moving them. Skipped when there is no database.
 */

vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => ({ userId: "x", role: "ADMIN", department: "EKSPLORASI" })),
  requireSession: vi.fn(async () => ({ userId: "x", role: "ADMIN", department: "EKSPLORASI" })),
}));
const { GET: controlRoute } = await import("@/app/api/(eksplorasi)/data-sources/qc/control/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[qc-control-db] skipped: no database reachable");
}

describe.skipIf(!reachable)("a standard's control charts", () => {
  const tag = `QCC${Date.now().toString(36).toUpperCase()}`;
  /** As the CRM List writes it, and as the data source does. */
  const crmName = `Oreas${tag}`;
  const control = `OREAS-${tag}`;
  let userId = "";

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { name: "QC control test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "EKSPLORASI" },
      })
    ).id;
    await prisma.crmStandard.create({
      data: { standard: crmName, testMethod: "Fusion XRF", ni: "1.00", sdNi: "0.10", co: "0.05", createdById: userId },
    });
    // One statement, so the rows are next to each other in the data source's order.
    const row = (suffix: string, sampleType: "FIELD" | "STANDARD", ni: string | null, date: string) => ({
      sampleId: `${tag}-${suffix}`,
      sampleType,
      control: sampleType === "STANDARD" ? control : null,
      ni,
      date: new Date(`${date}T00:00:00Z`),
      createdById: userId,
    });
    await prisma.dataSource.createMany({
      data: [
        row("F1", "FIELD", "1.1", "2026-01-01"),
        row("S1", "STANDARD", "1.02", "2026-01-02"),
        row("F2", "FIELD", "1.2", "2026-01-03"),
        row("F3", "FIELD", "1.3", "2026-01-04"),
        row("S2", "STANDARD", "1.35", "2026-01-05"),
        row("S3", "STANDARD", "<0.01", "2026-01-06"),
      ],
    });
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    await prisma.crmStandard.deleteMany({ where: { standard: crmName } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("finds the assays under either spelling, at their row in the data source", async () => {
    const data = await loadStandardControl({ standard: crmName });
    expect(data.standard).toBe(crmName);
    expect(data.standards).toContain(crmName);
    const ni = data.elements.find((entry) => entry.element === "ni")!;
    expect(ni.points.map((point) => point.sampleId)).toEqual([`${tag}-S1`, `${tag}-S2`]);
    // Two field samples sit between them, so the index steps by three.
    expect(ni.points[1].x - ni.points[0].x).toBe(3);
    // "<0.01" is a result, not a point.
    expect(ni.skipped).toBe(1);
  });

  it("draws the CRM List's lines, and none where it has no SD", async () => {
    const data = await loadStandardControl({ standard: crmName });
    const ni = data.elements.find((entry) => entry.element === "ni")!;
    expect(ni.limits?.plus3).toBeCloseTo(1.3);
    expect(ni.limits?.minus3).toBeCloseTo(0.7);
    // Co has a value but no SD in the CRM row.
    expect(data.elements.find((entry) => entry.element === "co")!.limits).toBeNull();
    expect(data.elements).toHaveLength(7);
  });

  it("thins the points by date without moving them", async () => {
    const all = await loadStandardControl({ standard: crmName });
    const later = await loadStandardControl({ standard: crmName, from: "2026-01-04" });
    const allNi = all.elements.find((entry) => entry.element === "ni")!.points;
    const laterNi = later.elements.find((entry) => entry.element === "ni")!.points;
    expect(laterNi.map((point) => point.sampleId)).toEqual([`${tag}-S2`]);
    expect(laterNi[0].x).toBe(allNi[1].x);
  });

  it("refuses a standard name longer than any in the CRM List", async () => {
    const response = await controlRoute(
      new NextRequest(`http://localhost/api/data-sources/qc/control?standard=${"x".repeat(51)}`)
    );
    expect(response.status).toBe(422);
  });
});
