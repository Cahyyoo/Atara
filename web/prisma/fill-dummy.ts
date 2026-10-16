import { PrismaClient, type Prisma } from "@prisma/client";
import { composeSampleIdent } from "../src/modules/lab/lib/samples/sample-ident";
import { createRandom, dummyInstrument, dummyResults, dummyWeights } from "./dummy-values";

/**
 * Fills in what the demonstration samples already in the database are
 * missing, so every screen and the Formulir Analysis Result have something to
 * show. Only empty fields are written; nothing already entered is replaced.
 * Safe to run again: a second run finds nothing left to fill.
 *
 * As far as each sample has got, and no further, so the data stays believable:
 *
 * - every sample gets its Sample ID (place -- MOL or LAM where none was set --, ore class, SIR, pit, barging,
 *   running and sample number, sacks), in batches of three to five that share
 *   a barging run and running number -- the form averages a batch;
 * - past dry preparation: the moisture-content weighing (Wp, W0, Wd);
 * - past analysis: the results;
 * - with results: the method, solution, finishing time and X-ray instrument.
 *
 * Each change is recorded in the record's history under the account that
 * would have made it -- the Database staff for the identity and the weighing,
 * the analyst for the results -- so the form's Preparator column is filled too.
 *
 *     npm run db:fill-dummy
 */

const prisma = new PrismaClient();
const rng = createRandom(20261008);
const HOUR_MS = 60 * 60 * 1000;
const REASON = "Dummy data filled in";

type Change = Record<string, { from: null; to: number | string | null }>;

function changesOf(values: Record<string, unknown>): Change {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { from: null, to: value instanceof Date ? value.toISOString() : (value as number | string | null) },
    ])
  );
}

/** Only the fields that are still empty on the record. */
function onlyEmpty<T extends Record<string, unknown>>(record: Record<string, unknown>, values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => record[key] === null)) as Partial<T>;
}

async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { sequenceOrder: "asc" } });
  const order = (key: string) => stages.find((stage) => stage.key === key)?.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
  const DRY_PREP = order("DRY_PREP");
  const ANALYSIS = order("ANALYSIS");
  const analysisId = stages.find((stage) => stage.key === "ANALYSIS")?.id;

  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true } });
  const analyst = users.find((user) => user.role === "ANALISIS");
  const database = users.find((user) => user.role === "DATABASE") ?? users.find((user) => user.role === "ADMIN");
  if (!analyst || !database) {
    throw new Error("An Analis and a Database (or Admin) account are needed. Run `npm run db:seed` first.");
  }

  const options = await prisma.masterOption.findMany({ where: { isActive: true } });
  const ofKind = (kind: string) => options.filter((option) => option.kind === kind);
  const codeOf = new Map(options.map((option) => [option.id, option.code]));
  // The two real pits; a test pit someone added to master data is left out.
  const pits = ofKind("PIT").filter((option) => /^A\d+$/i.test(option.code));
  const rockTypes = ofKind("ROCK_TYPE");
  const sirs = ofKind("SIR");
  const nonProds = ofKind("NON_PROD");
  if (pits.length === 0 || rockTypes.length === 0 || sirs.length === 0) {
    throw new Error("Master data is missing. Run `npm run db:seed-master` first.");
  }

  const records = await prisma.labRecord.findMany({
    include: {
      sample: {
        select: {
          deletedAt: true,
          currentStage: { select: { sequenceOrder: true } },
          logs: { select: { stageId: true, scannedAt: true }, orderBy: { scannedAt: "asc" } },
        },
      },
      parent: {
        select: {
          sample: {
            select: {
              deletedAt: true,
              currentStage: { select: { sequenceOrder: true } },
              logs: { select: { stageId: true, scannedAt: true }, orderBy: { scannedAt: "asc" } },
            },
          },
        },
      },
    },
    orderBy: [{ shiftDate: "asc" }, { sequence: "asc" }],
  });
  const taken = new Set(records.map((record) => record.sampleIdent).filter((ident): ident is string => ident !== null));

  // --- Sample IDs, a batch at a time ---
  const identity = new Map<string, Prisma.LabRecordUncheckedUpdateInput>();
  const places = ofKind("PLACE");
  const missing = records
    .filter((record) => !record.parentId && !record.sampleIdent && !record.sample?.deletedAt)
    // A sample with no place yet gets one: there is no Sample ID without it.
    .map((record) => (record.placeId || places.length === 0 ? record : { ...record, placeId: rng.pick(places).id, placeSet: true }));
  const byDayAndPlace = new Map<string, typeof missing>();
  for (const record of missing) {
    const key = `${record.shiftDate.toISOString().slice(0, 10)}|${record.placeId}`;
    byDayAndPlace.set(key, [...(byDayAndPlace.get(key) ?? []), record]);
  }
  let barging = rng.int(300, 600);
  for (const group of byDayAndPlace.values()) {
    for (let start = 0; start < group.length; ) {
      const size = Math.min(rng.int(3, 5), group.length - start);
      const batch = group.slice(start, start + size);
      start += size;

      const shared = {
        rockTypeId: rng.pick(rockTypes).id,
        nonProdId: nonProds.length > 0 && rng.random() < 0.15 ? rng.pick(nonProds).id : null,
        sirId: rng.pick(sirs).id,
        pitId: rng.pick(pits).id,
        bargingNo: `${(barging += rng.int(1, 9))}`,
        sequenceNo: rng.int(100, 9999),
      };
      batch.forEach((record, index) => {
        const parts = {
          rockTypeId: record.rockTypeId ?? shared.rockTypeId,
          nonProdId: record.nonProdId ?? shared.nonProdId,
          sirId: record.sirId ?? shared.sirId,
          pitId: record.pitId ?? shared.pitId,
          bargingNo: record.bargingNo ?? shared.bargingNo,
          sequenceNo: record.sequenceNo ?? shared.sequenceNo,
          sampleNo: record.sampleNo ?? index + 1,
          sackCount: record.sackCount ?? rng.int(18, 30),
        };
        const code = (id: string | null) => (id ? (codeOf.get(id) ?? null) : null);
        const ident = composeSampleIdent({
          place: code(record.placeId),
          rockType: code(parts.rockTypeId),
          nonProd: code(parts.nonProdId),
          sir: code(parts.sirId),
          pit: code(parts.pitId),
          bargingNo: parts.bargingNo,
          sequenceNo: parts.sequenceNo,
          sampleNo: parts.sampleNo,
          sackCount: parts.sackCount,
        });
        // Two records can never share a Sample ID; a clash is left for a person.
        if (!ident || taken.has(ident)) return;
        taken.add(ident);
        identity.set(record.id, {
          ...onlyEmpty(record, parts),
          ...("placeSet" in record ? { placeId: record.placeId } : {}),
          sampleIdent: ident,
        });
      });
    }
  }

  // --- Weighing, results and the instrument, as far as each sample has got ---
  const counts = { identity: 0, weights: 0, results: 0, instrument: 0 };
  for (const record of records) {
    const sample = record.sample ?? record.parent?.sample ?? null;
    if (!sample || sample.deletedAt) continue;
    const reached = sample.currentStage?.sequenceOrder ?? 0;

    const byDatabase: Record<string, unknown> = { ...(identity.get(record.id) ?? {}) };
    if (Object.keys(byDatabase).length > 0) counts.identity += 1;
    // The weighing belongs to the sample, not to a fraction sieved from it.
    if (!record.parentId && reached >= DRY_PREP) {
      const weights = onlyEmpty(record, dummyWeights(rng));
      if (Object.keys(weights).length > 0) counts.weights += 1;
      Object.assign(byDatabase, weights);
    }

    const byAnalyst: Record<string, unknown> = {};
    const analysed = reached >= ANALYSIS;
    if (analysed && record.ni === null) {
      Object.assign(byAnalyst, onlyEmpty(record, dummyResults(rng)));
      counts.results += 1;
    }
    if (analysed || record.ni !== null) {
      const analysedAt = sample.logs.findLast((log) => log.stageId === analysisId)?.scannedAt ?? record.updatedAt;
      const finished = new Date(Math.min(analysedAt.getTime() + rng.int(1, 3) * HOUR_MS, Date.now()));
      const instrument = onlyEmpty(record, dummyInstrument(rng, finished));
      if (Object.keys(instrument).length > 0) counts.instrument += 1;
      Object.assign(byAnalyst, instrument);
    }

    if (Object.keys(byDatabase).length === 0 && Object.keys(byAnalyst).length === 0) continue;

    await prisma.$transaction(async (tx) => {
      await tx.labRecord.update({
        where: { id: record.id },
        data: {
          ...byDatabase,
          ...byAnalyst,
          updatedById: Object.keys(byAnalyst).length > 0 ? analyst.id : database.id,
        } as Prisma.LabRecordUncheckedUpdateInput,
      });
      if (Object.keys(byDatabase).length > 0) {
        await tx.labRecordAudit.create({
          data: {
            labRecordId: record.id,
            changedById: database.id,
            changes: changesOf(byDatabase) as unknown as Prisma.InputJsonObject,
            reason: REASON,
          },
        });
      }
      if (Object.keys(byAnalyst).length > 0) {
        await tx.labRecordAudit.create({
          data: {
            labRecordId: record.id,
            changedById: analyst.id,
            changes: changesOf(byAnalyst) as unknown as Prisma.InputJsonObject,
            reason: REASON,
          },
        });
      }
    });
  }

  // A sample whose Sample ID was just written carries it to its sub-samples.
  const parents = [...identity.keys()];
  const subs = await prisma.labRecord.findMany({
    where: { parentId: { in: parents } },
    select: { id: true, subCode: true, parent: { select: { sampleIdent: true } } },
  });
  for (const sub of subs) {
    if (sub.parent?.sampleIdent && sub.subCode) {
      await prisma.labRecord.update({
        where: { id: sub.id },
        data: { sampleIdent: `${sub.parent.sampleIdent} (${sub.subCode})` },
      });
    }
  }

  console.log(
    `Filled in: ${counts.identity} Sample ID(s), ${counts.weights} weighing(s), ` +
      `${counts.results} set(s) of results, ${counts.instrument} instrument record(s).`
  );
}

main()
  .catch((error) => {
    console.error("Dummy fill failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
