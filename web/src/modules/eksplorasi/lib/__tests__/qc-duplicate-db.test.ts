import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/core/lib/prisma";
import { resetEksplorasiCaches } from "@/modules/eksplorasi/lib/eksplorasi-cache";
import { loadDuplicateCharts } from "@/modules/eksplorasi/lib/qc-duplicate-service";

/**
 * The duplicate charts against the real database: each duplicate paired with
 * the FIELD sample its Remarks names (spaces around it forgiven), never with
 * a sample of another type, and the duplicates with no original counted.
 * Skipped when there is no database.
 */

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[qc-duplicate-db] skipped: no database reachable");
}

// Rows are written straight through Prisma here, past the services that empty the caches.
beforeEach(() => resetEksplorasiCaches());

describe.skipIf(!reachable)("the duplicate charts", () => {
  const tag = `QCD${Date.now().toString(36).toUpperCase()}`;
  let userId = "";

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { name: "QC duplicate test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ADMIN", department: "EKSPLORASI" },
      })
    ).id;
    const row = (suffix: string, sampleType: "FIELD" | "STANDARD" | "DUPLICATE", ni: string | null, remarks?: string) => ({
      sampleId: `${tag}-${suffix}`,
      sampleType,
      ni,
      originalSampleIdRemarks: remarks ?? null,
      createdById: userId,
    });
    await prisma.dataSource.createMany({
      data: [
        row("F1", "FIELD", "1.00"),
        row("F2", "FIELD", "2.00"),
        row("S1", "STANDARD", "1.50"),
        row("D1", "DUPLICATE", "1.05", ` ${tag}-F1 `),
        row("D2", "DUPLICATE", "1.48", `${tag}-S1`),
        row("D3", "DUPLICATE", "0.95", "Field duplicate"),
        row("D4", "DUPLICATE", "<0.01", `${tag}-F2`),
      ],
    });
  });

  afterAll(async () => {
    await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: tag } } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("pairs each duplicate with the FIELD sample its Remarks names", async () => {
    const data = await loadDuplicateCharts({});
    const ni = data.elements.find((entry) => entry.element === "ni")!;
    expect(ni.pairs.filter((pair) => pair.sampleId.startsWith(tag))).toEqual([
      { sampleId: `${tag}-D1`, originalId: `${tag}-F1`, x: 1, y: 1.05 },
    ]);
    // D4 is paired, but its Ni is not a number.
    expect(ni.skipped).toBeGreaterThanOrEqual(1);
    expect(data.elements).toHaveLength(7);
  });

  it("counts the duplicates whose Remarks names no FIELD sample", async () => {
    // D2 names a standard and D3 is free text; other rows in the database may add to the count.
    expect((await loadDuplicateCharts({})).unmatched).toBeGreaterThanOrEqual(2);
  });
});
