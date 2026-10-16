import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guard } from "@/core/testing/guards";
import { prisma } from "@/core/lib/prisma";
import { applyBulkIdentity } from "@/modules/lab/lib/records/bulk-identity";
import { sampleIdentWhere } from "@/modules/lab/lib/samples/sample-ident-filter";
import { buildLabRecordWhere } from "@/modules/lab/lib/records/lab-record";
import { bulkIdentitySchema } from "@/modules/lab/validation/samples";

/**
 * Barcodes are made first and identified afterwards: filling in the identity
 * of many records at once, finding the ones still without a Sample ID, and a
 * clear refusal when an identity would repeat another's Sample ID. Against
 * the real database, skipped when there is none.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

describe("where it is enforced", () => {
  it("is for whoever edits the sample database", () => {
    expect(read("app", "api", "(lab)", "lab-records", "identity", "route.ts")).toMatch(guard("editDatabase"));
  });

  it("names the clash on a single edit instead of leaving it to the index", () => {
    expect(read("modules", "lab", "lib", "samples", "sample-ident-server.ts")).toContain("is already used by sample");
    for (const route of [
      ["app", "api", "(lab)", "lab-records", "[id]", "route.ts"],
      ["app", "api", "(lab)", "samples", "[code]", "identity", "route.ts"],
    ]) {
      expect(read(...route), route.join("/")).toContain("identTakenMessage(");
    }
  });

  it("filters lab records by whether they have a Sample ID", () => {
    expect(buildLabRecordWhere({ ident: "missing" }).sampleIdent).toBeNull();
    expect(buildLabRecordWhere({ ident: "has" }).sampleIdent).toEqual({ not: null });
    expect(buildLabRecordWhere({}).sampleIdent).toBeUndefined();
  });
});

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[bulk-identity] skipped: no database reachable");
}

describe.skipIf(!reachable)("against the database", () => {
  const tag = `B${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { samples: [] as string[], options: [] as string[], user: "" };
  let place = "";
  let pit = "";
  let seq = 0;

  async function barcode(sampleIdent: string | null = null) {
    seq += 1;
    const sample = await prisma.sample.create({
      data: { sampleCode: `${tag}-${seq}`, status: "PENDING", createdById: created.user },
    });
    created.samples.push(sample.id);
    return prisma.labRecord.create({
      data: {
        sampleId: sample.id,
        labCode: `${tag}.${seq}`,
        shiftDate: new Date("2000-01-04T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + seq,
        sampleIdent,
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Bulk test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "DATABASE", department: "LAB" as const },
    });
    created.user = user.id;
    const option = async (kind: "PLACE" | "PIT", code: string) => {
      const row = await prisma.masterOption.create({ data: { kind, code } });
      created.options.push(row.id);
      return row.id;
    };
    place = await option("PLACE", `${tag}P`);
    pit = await option("PIT", `${tag}T`);
  });

  afterAll(async () => {
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.masterOption.deleteMany({ where: { id: { in: created.options } } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
  });

  it("fills in place and pit for several records, numbers them, and writes the history", async () => {
    const records = [await barcode(), await barcode(), await barcode()];

    const result = await applyBulkIdentity({
      groups: [{ ids: records.map((record) => record.id), set: { placeId: place, pitId: pit }, sampleNoStart: 5 }],
      userId: created.user,
    });
    expect(result.updated).toBe(3);
    expect(result.clashes).toEqual([]);

    const after = await prisma.labRecord.findMany({
      where: { id: { in: records.map((record) => record.id) } },
      include: { audits: true },
      orderBy: { labCode: "asc" },
    });
    expect(after.map((record) => record.sampleIdent)).toEqual([
      `${tag}P/${tag}T/5`,
      `${tag}P/${tag}T/6`,
      `${tag}P/${tag}T/7`,
    ]);
    expect(after.every((record) => record.placeId === place && record.audits.length === 1)).toBe(true);
  });

  it("leaves alone what was not filled in", async () => {
    const record = await barcode();
    await prisma.labRecord.update({ where: { id: record.id }, data: { pitId: pit, bargingNo: "B71" } });

    await applyBulkIdentity({ groups: [{ ids: [record.id], set: { placeId: place } }], userId: created.user });
    const after = await prisma.labRecord.findUnique({ where: { id: record.id } });
    expect(after).toMatchObject({ placeId: place, pitId: pit, bargingNo: "B71" });
  });

  it("previews without writing, and refuses Sample IDs that would repeat", async () => {
    const taken = await barcode(`${tag}P/${tag}T/50`);
    const fresh = [await barcode(), await barcode()];
    const ids = fresh.map((record) => record.id);

    // Same identity for both, no numbering: they would share one Sample ID,
    // and with number 50 one would also take the existing record's.
    const preview = await applyBulkIdentity({
      groups: [{ ids, set: { placeId: place, pitId: pit, sampleNo: 50 } }],
      dryRun: true,
      userId: created.user,
    });
    expect(preview.updated).toBe(0);
    expect(preview.clashes).toEqual([`${tag}P/${tag}T/50`]);
    expect(preview.preview.map((row) => row.to)).toEqual([`${tag}P/${tag}T/50`, `${tag}P/${tag}T/50`]);

    await expect(
      applyBulkIdentity({
        groups: [{ ids, set: { placeId: place, pitId: pit, sampleNo: 50 } }],
        userId: created.user,
      })
    ).rejects.toMatchObject({ status: 409 });
    const untouched = await prisma.labRecord.findMany({ where: { id: { in: ids } } });
    expect(untouched.every((record) => record.sampleIdent === null && record.placeId === null)).toBe(true);
    expect(taken.sampleIdent).toBe(`${tag}P/${tag}T/50`);
  });

  it("changes and clears columns of records that already have a Sample ID", async () => {
    const other = await prisma.masterOption.create({ data: { kind: "PIT", code: `${tag}U` } });
    created.options.push(other.id);
    const record = await barcode();
    await prisma.labRecord.update({
      where: { id: record.id },
      data: { placeId: place, pitId: pit, bargingNo: "B9", sampleIdent: `${tag}P/${tag}T/9` },
    });

    // A batch entered under the wrong pit, and a barging run that was not one.
    const result = await applyBulkIdentity({
      groups: [{ ids: [record.id], set: { pitId: other.id }, clear: ["bargingNo"] }],
      userId: created.user,
    });
    expect(result).toMatchObject({ updated: 1, changed: 1 });

    const after = await prisma.labRecord.findUnique({ where: { id: record.id }, include: { audits: true } });
    expect(after).toMatchObject({ pitId: other.id, bargingNo: null, sampleIdent: `${tag}P/${tag}U` });
    expect(after?.audits[0]?.reason).toBe("Identity changed for several records at once");
  });

  it("gives each group its own change in one go, and refuses a clash between groups", async () => {
    const other = await prisma.masterOption.create({ data: { kind: "PIT", code: `${tag}V` } });
    created.options.push(other.id);
    const first = await barcode();
    const second = await barcode();

    const result = await applyBulkIdentity({
      groups: [
        { ids: [first.id], set: { placeId: place, pitId: pit, sampleNo: 70 } },
        { ids: [second.id], set: { placeId: place, pitId: other.id, sampleNo: 70 } },
      ],
      userId: created.user,
    });
    expect(result).toMatchObject({ updated: 2, clashes: [] });
    const identOf = async (id: string) =>
      (await prisma.labRecord.findUnique({ where: { id }, select: { sampleIdent: true } }))?.sampleIdent;
    expect(await identOf(first.id)).toBe(`${tag}P/${tag}T/70`);
    expect(await identOf(second.id)).toBe(`${tag}P/${tag}V/70`);

    // The second group moved onto the first one's pit, while the first keeps
    // its Sample ID: the same Sample ID twice, caught across groups.
    const moved = {
      groups: [
        { ids: [first.id], set: {} },
        { ids: [second.id], set: { pitId: pit } },
      ],
      userId: created.user,
    };
    const preview = await applyBulkIdentity({ ...moved, dryRun: true });
    expect(preview.clashes).toEqual([`${tag}P/${tag}T/70`]);
    await expect(applyBulkIdentity(moved)).rejects.toMatchObject({ status: 409 });
    expect(await identOf(second.id)).toBe(`${tag}P/${tag}V/70`);
  });

  it("refuses a column that is both changed and cleared", () => {
    const parsed = bulkIdentitySchema.safeParse({ groups: [{ ids: ["x"], set: { pitId: "p" }, clear: ["pitId"] }] });
    expect(parsed.success).toBe(false);
  });

  it("refuses a record in two groups, and more than 200 records in all", () => {
    expect(
      bulkIdentitySchema.safeParse({ groups: [{ ids: ["x"], set: {} }, { ids: ["x"], set: {} }] }).success
    ).toBe(false);
    const ids = (from: number) => Array.from({ length: 150 }, (_, index) => `r${from + index}`);
    expect(
      bulkIdentitySchema.safeParse({ groups: [{ ids: ids(0), set: {} }, { ids: ids(150), set: {} }] }).success
    ).toBe(false);
    expect(bulkIdentitySchema.safeParse({ groups: [{ ids: ids(0), set: {} }] }).success).toBe(true);
  });

  it("finds the samples still without a Sample ID", async () => {
    const without = await barcode();
    const withIdent = await barcode(`${tag}-HAS`);
    const ours = { sampleCode: { startsWith: tag } };

    const missing = await prisma.sample.findMany({
      where: { AND: [ours, sampleIdentWhere("missing")] },
      select: { id: true },
    });
    const has = await prisma.sample.findMany({ where: { AND: [ours, sampleIdentWhere("has")] }, select: { id: true } });

    expect(missing.map((row) => row.id)).toContain(without.sampleId);
    expect(missing.map((row) => row.id)).not.toContain(withIdent.sampleId);
    expect(has.map((row) => row.id)).toContain(withIdent.sampleId);
  });
});
