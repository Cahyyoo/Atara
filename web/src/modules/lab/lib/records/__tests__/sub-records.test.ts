import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";

/**
 * Sub-samples and the overwrite guard, against the real database: what a
 * paste or an import makes, what it refuses to replace, and how a sub follows
 * its parent. Skipped when there is no database.
 */

const session = { userId: "", name: "Sub test", email: "", role: "ANALISIS" as const, department: "LAB" as const, sessionId: "test" };
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { PATCH: bulk } = await import("@/app/api/(lab)/lab-records/bulk/route");
const { POST: resolve } = await import("@/app/api/(lab)/lab-records/resolve/route");
const { POST: importSheet } = await import("@/app/api/(lab)/lab-records/import/route");
const { DELETE: removeSubs } = await import("@/app/api/(lab)/lab-records/subs/route");
const { syncSubs } = await import("@/modules/lab/lib/records/sub-records");
const { buildGradeControl } = await import("@/modules/lab/lib/analytics/grade-control");
const { loadYtdProduction } = await import("@/modules/lab/lib/analytics/ytd-production");

function request(url: string, method: string, body: unknown) {
  const text = JSON.stringify(body);
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: text,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
  });
}

async function call(handler: (request: NextRequest) => Promise<Response>, url: string, method: string, body: unknown) {
  const response = await handler(request(url, method, body));
  return { status: response.status, body: await response.json() };
}

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[sub-records] skipped: no database reachable");
}

describe.skipIf(!reachable)("sub-samples against the database", () => {
  const tag = `S${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { samples: [] as string[], options: [] as string[], user: "" };
  let place = "";
  let pit = "";
  let otherPit = "";
  let rockType = "";
  let seq = 0;

  /** A sample with a record, the identity composed the way the app stores it. */
  async function sample(ni: number | null = null) {
    seq += 1;
    const row = await prisma.sample.create({
      data: { sampleCode: `${tag}-${seq}`, status: "PENDING", createdById: created.user },
    });
    created.samples.push(row.id);
    return prisma.labRecord.create({
      data: {
        sampleId: row.id,
        labCode: `${tag}.${seq}`,
        // Inside the dashboard's window, so the grade-control check sees it.
        shiftDate: new Date("2000-01-04T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + seq,
        placeId: place,
        pitId: pit,
        sampleNo: seq,
        sampleIdent: `${tag}P/P${tag}T/${seq}`,
        ni,
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Sub test", email: `${tag.toLowerCase()}@test.invalid`, password: "x", role: "ANALISIS", department: "LAB" as const },
    });
    created.user = user.id;
    session.userId = user.id;
    session.email = user.email;
    const option = async (kind: "PLACE" | "PIT" | "ROCK_TYPE", code: string) => {
      const row = await prisma.masterOption.create({ data: { kind, code } });
      created.options.push(row.id);
      return row.id;
    };
    place = await option("PLACE", `${tag}P`);
    pit = await option("PIT", `${tag}T`);
    otherPit = await option("PIT", `${tag}U`);
    rockType = await option("ROCK_TYPE", `${tag}R`);
  });

  afterAll(async () => {
    await prisma.sample.deleteMany({ where: { id: { in: created.samples } } });
    await prisma.masterOption.deleteMany({ where: { id: { in: created.options } } });
    if (created.user) await prisma.user.delete({ where: { id: created.user } });
  });

  it("finds samples by a space-separated Sample ID, and names the subs still to make", async () => {
    const parent = await sample();
    const spaced = `${tag}P P${tag}T ${seq}`;
    const { body } = await call(resolve, "/api/lab-records/resolve", "POST", {
      keys: [spaced, `${spaced} (-20)`, `${tag}-NOPE`],
    });

    expect(body.data.results.map((entry: { status: string }) => entry.status)).toEqual(["found", "newSub", "unknown"]);
    expect(body.data.results[0].record.id).toBe(parent.id);
    expect(body.data.results[1]).toMatchObject({ code: "-20", parent: { id: parent.id } });
  });

  /**
   * The identity above is a place and a pit, so its id holds no space at all.
   * This one has a rock type, which puts the id's leading group in the hand it
   * is really stored in -- and it still has to be found by someone typing
   * slashes throughout, which is how it was written before the change and how
   * it still comes back off an older sheet.
   */
  it("finds a sample whose id holds a space, in whichever hand the key is written", async () => {
    seq += 1;
    const row = await prisma.sample.create({
      data: { sampleCode: `${tag}-R${seq}`, status: "PENDING", createdById: created.user },
    });
    created.samples.push(row.id);
    const parent = await prisma.labRecord.create({
      data: {
        sampleId: row.id,
        labCode: `${tag}.R${seq}`,
        shiftDate: new Date("2000-01-04T00:00:00Z"),
        sequence: (Date.now() % 100_000) * 100 + seq,
        placeId: place,
        rockTypeId: rockType,
        pitId: pit,
        sampleNo: seq,
        sampleIdent: `${tag}P ${tag}R/P${tag}T/${seq}`,
      },
    });
    expect(parent.sampleIdent).toContain(" ");

    const keys = [
      parent.sampleIdent!,
      parent.sampleIdent!.replaceAll(" ", "/"),
      parent.sampleIdent!.replaceAll("/", " "),
    ];
    const { body } = await call(resolve, "/api/lab-records/resolve", "POST", { keys });

    expect(body.data.results.map((entry: { status: string }) => entry.status)).toEqual([
      "found",
      "found",
      "found",
    ]);
    for (const entry of body.data.results) {
      expect(entry.record.id).toBe(parent.id);
    }
  });

  it("creates a sub-sample on save, under its parent, and fills it the second time", async () => {
    const parent = await sample();
    const first = await call(bulk, "/api/lab-records/bulk", "PATCH", {
      records: [{ parentId: parent.id, subCode: " -20 ", ni: 1.4, fe: 22 }],
    });
    expect(first.status).toBe(200);

    const sub = await prisma.labRecord.findFirstOrThrow({ where: { parentId: parent.id } });
    expect(sub).toMatchObject({
      subCode: "-20",
      sampleId: null,
      sequence: null,
      labCode: `${parent.labCode} (-20)`,
      sampleIdent: `${parent.sampleIdent} (-20)`,
      placeId: place,
      pitId: pit,
    });
    expect(Number(sub.ni)).toBe(1.4);

    // The same code again fills the same sub.
    await call(bulk, "/api/lab-records/bulk", "PATCH", { records: [{ parentId: parent.id, subCode: "-20", co: 0.1 }] });
    expect(await prisma.labRecord.count({ where: { parentId: parent.id } })).toBe(1);

    // A sub's identity is its parent's: it cannot be changed on the sub.
    const refused = await call(bulk, "/api/lab-records/bulk", "PATCH", { records: [{ id: sub.id, pitId: otherPit }] });
    expect(refused.status).toBe(422);
  });

  it("refuses identity columns on a parent too: results entry is not identity editing", async () => {
    const parent = await sample();
    const refused = await call(bulk, "/api/lab-records/bulk", "PATCH", { records: [{ id: parent.id, pitId: otherPit }] });
    expect(refused.status).toBe(403);
    expect((await prisma.labRecord.findUniqueOrThrow({ where: { id: parent.id } })).pitId).toBe(pit);
  });

  it("refuses to replace an earlier result unless asked to, and fills empty ones freely", async () => {
    const record = await sample(1.2);

    const filling = await call(bulk, "/api/lab-records/bulk", "PATCH", { records: [{ id: record.id, ni: 1.2, fe: 20 }] });
    expect(filling.status).toBe(200);

    const refused = await call(bulk, "/api/lab-records/bulk", "PATCH", { records: [{ id: record.id, ni: 1.35 }] });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("overwrite");
    expect(refused.body.details.overwrites[0].fields).toEqual([{ field: "ni", from: 1.2, to: 1.35 }]);
    expect(Number((await prisma.labRecord.findUniqueOrThrow({ where: { id: record.id } })).ni)).toBe(1.2);

    const replaced = await call(bulk, "/api/lab-records/bulk", "PATCH", {
      records: [{ id: record.id, ni: 1.35 }],
      overwrite: true,
    });
    expect(replaced.status).toBe(200);
    const after = await prisma.labRecord.findUniqueOrThrow({
      where: { id: record.id },
      include: { audits: { orderBy: { changedAt: "desc" } } },
    });
    expect(Number(after.ni)).toBe(1.35);
    expect(after.audits[0].reason).toBe("Overwrote earlier results");
  });

  it("imports by Sample ID, creating subs, and guards earlier results the same way", async () => {
    const parent = await sample(1.2);
    const spaced = parent.sampleIdent!.replaceAll("/", " ");
    const csv = `Sample ID\tNi\n${spaced}\t1.5\n${spaced} (-20)\t1.7\n`;

    const preview = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: false });
    expect(preview.body.data.summary).toMatchObject({ update: 1, create: 1, overwrite: 1, unknown: 0 });

    const refused = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: true });
    expect(refused.status).toBe(409);
    expect(await prisma.labRecord.count({ where: { parentId: parent.id } })).toBe(0);

    const applied = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: true, overwrite: true });
    expect(applied.status).toBe(200);
    const sub = await prisma.labRecord.findFirstOrThrow({ where: { parentId: parent.id } });
    expect(Number(sub.ni)).toBe(1.7);
  });

  it("warns about results that read like another row's or another sample's, and saves them only when told", async () => {
    // Figures no other test writes, so a stored look-alike is the one made here.
    const odd = Number(((Date.now() % 900) / 1000 + 7).toFixed(3));
    const other = Number((odd + 1).toFixed(3));
    const stored = await sample();
    await prisma.labRecord.update({ where: { id: stored.id }, data: { ni: odd, fe: 12.345 } });
    const [first, second, third] = [await sample(), await sample(), await sample()];
    const csv = [
      `Sample ID\tNi\tFe`,
      `${first.sampleIdent}\t${odd}\t12.345`,
      `${second.sampleIdent}\t${other}\t12.345`,
      `${third.sampleIdent}\t${other}\t12.345`,
    ].join("\n");

    const preview = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: false });
    const [likeStored, likeRow, likeRowToo] = preview.body.data.rows;
    expect(likeStored.duplicateOf).toEqual([stored.sampleIdent]);
    expect(likeStored.duplicateLines).toBeUndefined();
    expect(likeRow.duplicateLines).toEqual([4]);
    expect(likeRowToo.duplicateLines).toEqual([3]);
    expect(preview.body.data.summary.duplicate).toBe(3);

    const refused = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: true });
    expect(refused).toMatchObject({ status: 409, body: { code: "duplicate" } });
    expect((await prisma.labRecord.findUniqueOrThrow({ where: { id: first.id } })).ni).toBeNull();

    const applied = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: true, duplicates: true });
    expect(applied.status).toBe(200);
    expect(Number((await prisma.labRecord.findUniqueOrThrow({ where: { id: first.id } })).ni)).toBe(odd);
  });

  it("keeps a trace element to ten decimals, and refuses an eleventh", async () => {
    const record = await sample();
    const csv = `Sample ID\tZn\n${record.sampleIdent}\t0.0303`;
    const applied = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: true, duplicates: true });
    expect(applied.status).toBe(200);
    expect((await prisma.labRecord.findUniqueOrThrow({ where: { id: record.id } })).zn?.toString()).toBe("0.0303");

    const tooFine = `Sample ID\tZn\n${record.sampleIdent}\t0.12345678901`;
    const preview = await call(importSheet, "/api/lab-records/import", "POST", { csv: tooFine, apply: false });
    expect(preview.body.data.rows[0]).toMatchObject({ status: "invalid", field: "zn" });
  });

  it("names the column at fault, so a grid can mark the very cell", async () => {
    const parent = await sample();
    const csv = `Sample ID\tNi\tFe\n${parent.sampleIdent}\t1.5\tabc\nNO-SUCH-SAMPLE\t1\t2\n\t1\t2\n`;
    const preview = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: false });
    const [bad, unknown, keyless] = preview.body.data.rows;

    expect(bad).toMatchObject({ line: 2, status: "invalid", field: "fe" });
    expect(unknown).toMatchObject({ line: 3, status: "unknown", field: "sampleIdent" });
    expect(keyless).toMatchObject({ line: 4, status: "invalid", field: "sampleIdent" });
  });

  it("keeps a sub in step when its parent's identity moves", async () => {
    const parent = await sample();
    await call(bulk, "/api/lab-records/bulk", "PATCH", { records: [{ parentId: parent.id, subCode: "-20", ni: 1 }] });

    await prisma.$transaction(async (tx) => {
      await tx.labRecord.update({
        where: { id: parent.id },
        data: { pitId: otherPit, sampleIdent: `${tag}P/P${tag}U/${seq}` },
      });
      await syncSubs(tx, [parent.id]);
    });

    const sub = await prisma.labRecord.findFirstOrThrow({ where: { parentId: parent.id } });
    expect(sub).toMatchObject({ pitId: otherPit, sampleIdent: `${tag}P/P${tag}U/${seq} (-20)` });
  });

  it("leaves the sack count out of the match, and guesses nothing when that fits two", async () => {
    // Stored with the sack count at the end, the way the app composes it.
    const withSacks = async (running: string, sacks: number) => {
      seq += 1;
      const row = await prisma.sample.create({
        data: { sampleCode: `${tag}-${seq}`, status: "PENDING", createdById: created.user },
      });
      created.samples.push(row.id);
      return prisma.labRecord.create({
        data: {
          sampleId: row.id,
          labCode: `${tag}.${seq}`,
          shiftDate: new Date("2000-01-04T00:00:00Z"),
          sequence: (Date.now() % 100_000) * 100 + seq,
          sackCount: sacks,
          sampleIdent: `${tag}P/P${tag}T/B10/${running}/${sacks}`,
        },
      });
    };
    const one = await withSacks("3778.1", 25);
    const sub = await prisma.labRecord.create({
      data: {
        labCode: `${one.labCode} (-20)`,
        shiftDate: one.shiftDate,
        parentId: one.id,
        subCode: "-20",
        sackCount: 25,
        sampleIdent: `${one.sampleIdent} (-20)`,
      },
    });
    await withSacks("3779.1", 25);
    await withSacks("3779.1", 30);

    const { body } = await call(resolve, "/api/lab-records/resolve", "POST", {
      keys: [
        `${tag}P/P${tag}T/B10/3778.1`,
        `${tag}P P${tag}T B10 3778.1 (-20)`,
        `${tag}P/P${tag}T/B10/3778.1/25`,
        `${tag}P/P${tag}T/B10/3779.1`,
        `${tag}P/P${tag}T/B10/3779.1/30`,
      ],
    });
    const results = body.data.results as { status: string; record?: { id: string } }[];
    expect(results.map((entry) => entry.status)).toEqual(["found", "found", "found", "ambiguous", "found"]);
    expect(results[0].record?.id).toBe(one.id);
    expect(results[1].record?.id).toBe(sub.id);

    // The import reads a column headed Lab Code as the Sample ID, sacks left out.
    const csv = `Lab Code\tNi\n${tag}P/P${tag}T/B10/3778.1\t1.9\n`;
    const imported = await call(importSheet, "/api/lab-records/import", "POST", { csv, apply: true });
    expect(imported.status).toBe(200);
    expect(Number((await prisma.labRecord.findUniqueOrThrow({ where: { id: one.id } })).ni)).toBe(1.9);
  });

  it("removes sub-samples only, and goes with its parent", async () => {
    const parent = await sample();
    await call(bulk, "/api/lab-records/bulk", "PATCH", {
      records: [
        { parentId: parent.id, subCode: "-20", ni: 1 },
        { parentId: parent.id, subCode: "+40", ni: 2 },
      ],
    });
    const plus = await prisma.labRecord.findFirstOrThrow({ where: { parentId: parent.id, subCode: "+40" } });

    const notSubs = await call(removeSubs, "/api/lab-records/subs", "DELETE", { ids: [parent.id] });
    expect(notSubs.status).toBe(422);

    const removed = await call(removeSubs, "/api/lab-records/subs", "DELETE", { ids: [plus.id] });
    expect(removed.status).toBe(200);
    expect(await prisma.labRecord.count({ where: { parentId: parent.id } })).toBe(1);
    const audits = await prisma.labRecordAudit.findMany({ where: { labRecordId: parent.id } });
    expect(audits.some((audit) => audit.reason === "Sub sample (+40) removed")).toBe(true);

    await prisma.labRecord.delete({ where: { id: parent.id } });
    expect(await prisma.labRecord.count({ where: { parentId: parent.id } })).toBe(0);
  });

  it("counts samples, sub-samples, or both in grade control, as asked", async () => {
    // A pit of its own, so no other test's records fall into the figures.
    const ownPit = await prisma.masterOption.create({ data: { kind: "PIT", code: `${tag}G` } });
    created.options.push(ownPit.id);
    const parent = await sample(1);
    await prisma.labRecord.update({ where: { id: parent.id }, data: { pitId: ownPit.id } });
    await call(bulk, "/api/lab-records/bulk", "PATCH", { records: [{ parentId: parent.id, subCode: "-20", ni: 3 }] });
    // The window is when the sample was made: now.
    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);

    const rowFor = async (subs: "parents" | "all" | "subs") =>
      (await buildGradeControl(from, to, ["pit"], { pitId: ownPit.id, subs })).rows[0];

    expect(await rowFor("parents")).toMatchObject({ samples: 1, avg: { ni: 1 } });
    expect(await rowFor("subs")).toMatchObject({ samples: 1, avg: { ni: 3 } });
    expect(await rowFor("all")).toMatchObject({ samples: 2, avg: { ni: 2 } });
  });

  it("counts the year so far for the wall monitor, per place and production code", async () => {
    await sample(2);
    const ytd = await loadYtdProduction(new Date(Date.now() + 60_000));
    expect(ytd.year).toBe(new Date(Date.now() + 8 * 3_600_000).getUTCFullYear());
    // This file's samples carry no non-production code: they are production.
    const own = ytd.rows.find((row) => row.place === `${tag}P` && row.code === null);
    expect(own?.samples).toBeGreaterThan(0);
  });
});
