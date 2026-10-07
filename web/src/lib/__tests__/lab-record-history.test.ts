import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listHistory, loadRecordHistory } from "@/lib/lab-record-history";

/**
 * The history of result updates, against the real database: a sample's
 * history with its sub-samples', master options read back as codes, and the
 * full list searched and narrowed to result changes. Skipped when there is no
 * database.
 */

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[lab-record-history] skipped: no database reachable");
}

describe.skipIf(!reachable)("result history against the database", () => {
  const tag = `H${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { sample: "", options: [] as string[], user: "" };
  let parentId = "";
  let subId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "History test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ANALISIS" },
    });
    created.user = user.id;
    const pitA = await prisma.masterOption.create({ data: { kind: "PIT", code: `${tag}A` } });
    const pitB = await prisma.masterOption.create({ data: { kind: "PIT", code: `${tag}B` } });
    created.options.push(pitA.id, pitB.id);

    const sample = await prisma.sample.create({
      data: { sampleCode: `${tag}-1`, status: "PENDING", createdById: user.id },
    });
    created.sample = sample.id;
    const parent = await prisma.labRecord.create({
      data: {
        sampleId: sample.id,
        labCode: `${tag}.1`,
        shiftDate: new Date("2000-01-04T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + 1,
        sampleIdent: `${tag}/S1/3778.1/25`,
      },
    });
    parentId = parent.id;
    const sub = await prisma.labRecord.create({
      data: {
        labCode: `${tag}.1 (-20)`,
        shiftDate: parent.shiftDate,
        parentId,
        subCode: "-20",
        sampleIdent: `${tag}/S1/3778.1/25 (-20)`,
      },
    });
    subId = sub.id;

    const at = (minutes: number) => new Date(Date.now() - (10 - minutes) * 60_000);
    await prisma.labRecordAudit.createMany({
      data: [
        { labRecordId: parentId, changedById: user.id, changedAt: at(1), changes: { ni: { from: null, to: 1.2 } } },
        { labRecordId: parentId, changedById: user.id, changedAt: at(2), changes: { pitId: { from: pitA.id, to: pitB.id } } },
        { labRecordId: subId, changedById: user.id, changedAt: at(3), changes: { ni: { from: null, to: 1.4 } } },
        {
          labRecordId: parentId,
          changedById: user.id,
          changedAt: at(4),
          changes: { ni: { from: 1.2, to: 1.35 } },
          reason: "Overwrote earlier results",
        },
      ],
    });
  });

  afterAll(async () => {
    if (created.sample) await prisma.sample.delete({ where: { id: created.sample } });
    await prisma.masterOption.deleteMany({ where: { id: { in: created.options } } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
  });

  it("gives a sample's history with its sub-samples', newest first", async () => {
    const entries = (await loadRecordHistory(parentId))!;
    expect(entries.map((entry) => entry.changes)).toEqual([
      { ni: { from: 1.2, to: 1.35 } },
      { ni: { from: null, to: 1.4 } },
      // Master options read back as their codes.
      { pitId: { from: `${tag}A`, to: `${tag}B` } },
      { ni: { from: null, to: 1.2 } },
    ]);
    expect(entries[1].record).toMatchObject({ id: subId, subCode: "-20", sampleCode: `${tag}-1` });
    expect(entries[0]).toMatchObject({ changedBy: "History test", reason: "Overwrote earlier results" });
  });

  it("gives a sub-sample only its own", async () => {
    const entries = (await loadRecordHistory(subId))!;
    expect(entries).toHaveLength(1);
    expect(await loadRecordHistory("no-such-record")).toBeNull();
  });

  it("lists every change by Sample ID, only the result ones unless asked", async () => {
    const results = await listHistory({ search: `${tag}/S1`, resultsOnly: true, page: 1 });
    expect(results.total).toBe(3);
    expect(results.entries.every((entry) => "ni" in entry.changes)).toBe(true);

    const all = await listHistory({ search: `${tag}/S1`, resultsOnly: false, page: 1 });
    expect(all.total).toBe(4);

    // The barcode finds the sub-sample's changes too.
    const byBarcode = await listHistory({ search: `${tag}-1`, resultsOnly: true, page: 1 });
    expect(byBarcode.total).toBe(3);
  });
});
