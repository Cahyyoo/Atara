import { PrismaClient, type SampleStatus } from "@prisma/client";
import { generateSampleCodes } from "@/lib/sample-code";
import { allocateLabCodes } from "@/lib/lab-code";
import { getShiftDate, SHIFT_START_HOUR, SHIFT_TIMEZONE_OFFSET_MINUTES } from "@/lib/shift-date";
import { composeSampleIdent } from "@/lib/sample-ident";
import { createRandom, DUMMY_REMARKS, dummyInstrument, dummyResults, dummyWeights } from "./dummy-values";

const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How many shift days back from today to fill, including today. */
const DAYS = 40;

/** Roughly how many samples arrive on a shift day. */
const PER_DAY = 30;

/** The mines the samples come from. */
const PLACES = ["LAM", "MOL"] as const;

/** Deterministic, so re-running produces comparable data. */
const rng = createRandom(20260908);
const randomInt = rng.int;
const pick = rng.pick;

/**
 * A shift day's work, as the batches it arrives in: one barging run of three
 * to five samples at a time, which is the size the lab's own form averages
 * over. Sizes vary, so the last batch of the day takes whatever is left.
 */
function runsForDay(): { place: string; quantity: number }[] {
  const runs: { place: string; quantity: number }[] = [];
  for (let left = PER_DAY; left > 0; ) {
    const quantity = Math.min(left, randomInt(3, 5));
    runs.push({ place: pick(PLACES), quantity });
    left -= quantity;
  }
  return runs;
}

/** The UTC instant a shift day starts (07:00 WITA). */
function shiftStart(shiftDate: Date): Date {
  const offsetHours = SHIFT_TIMEZONE_OFFSET_MINUTES / 60 - SHIFT_START_HOUR;
  return new Date(shiftDate.getTime() - offsetHours * HOUR_MS);
}

async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { sequenceOrder: "asc" } });
  if (stages.length === 0) {
    throw new Error("No stages found. Run `npm run db:seed` first.");
  }

  const users = await prisma.user.findMany();
  const admin = users.find((user) => user.role === "ADMIN");
  const operators = users.filter((user) => user.role === "OPERATOR");
  // Who enters the results, and who types in the identity and the weighing.
  if (!admin || operators.length === 0) {
    throw new Error("Admin/operator users are missing. Run `npm run db:seed` first.");
  }
  const analyst = users.find((user) => user.role === "ANALISIS") ?? admin;
  const database = users.find((user) => user.role === "DATABASE") ?? admin;

  // The place is master data too, and every lab record carries one.
  const places = await prisma.masterOption.findMany({
    where: { kind: "PLACE" },
    select: { id: true, code: true },
  });
  const placeIdByCode = new Map(places.map((place) => [place.code, place.id]));

  // The rest of a Sample ID, so every sample has one.
  const options = await prisma.masterOption.findMany({ where: { isActive: true } });
  const ofKind = (kind: string) => options.filter((option) => option.kind === kind);
  const rockTypes = ofKind("ROCK_TYPE");
  const sirs = ofKind("SIR");
  const pits = ofKind("PIT").filter((option) => /^A\d+$/i.test(option.code));
  const nonProds = ofKind("NON_PROD");
  const taken = new Set(
    (await prisma.labRecord.findMany({ where: { sampleIdent: { not: null } }, select: { sampleIdent: true } })).map(
      (record) => record.sampleIdent
    )
  );
  let barging = randomInt(600, 900);
  for (const code of PLACES) {
    if (!placeIdByCode.has(code)) {
      throw new Error(`Place "${code}" is missing. Run \`npm run db:seed-master\` first.`);
    }
  }

  const lastStage = stages[stages.length - 1];
  const today = getShiftDate();
  let created = 0;

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const shiftDate = new Date(today.getTime() - dayOffset * DAY_MS);
    const dayStart = shiftStart(shiftDate);
    const runs = runsForDay();

    await prisma.$transaction(
      async (tx) => {
        for (const run of runs) {
          const sampleCodes = await generateSampleCodes(
            run.quantity,
            shiftDate.getUTCFullYear(),
            tx
          );
          const labCodes = await allocateLabCodes(tx, run.quantity, shiftDate);
          // One batch per run: the same ore class, SIR, pit, barging and
          // running number, numbered 1, 2, 3 -- the form averages a batch.
          const batch = {
            rockType: rockTypes.length > 0 ? pick(rockTypes) : null,
            // Most of what the lab receives is production; a run now and then
            // is a test pit or a barge check, which the form reports on a
            // sheet of its own.
            nonProd: nonProds.length > 0 && rng.random() < 0.15 ? pick(nonProds) : null,
            sir: sirs.length > 0 ? pick(sirs) : null,
            pit: pits.length > 0 ? pick(pits) : null,
            bargingNo: `B${(barging += randomInt(1, 9))}`,
            sequenceNo: randomInt(100, 9999),
          };

          for (let index = 0; index < run.quantity; index++) {
            // Samples arrive spread across the shift; older days are further along.
            // Never past "now" — a sample created in the future falls outside every
            // report range and makes the dashboard disagree with itself.
            const arrivedAt = new Date(
              Math.min(dayStart.getTime() + randomInt(0, 20) * HOUR_MS, Date.now() - HOUR_MS)
            );
            const reachedIndex =
              dayOffset === 0 ? randomInt(-1, 2) : randomInt(1, stages.length - 1);

            const status: SampleStatus =
              reachedIndex < 0
                ? "PENDING"
                : stages[reachedIndex].id === lastStage.id
                  ? "COMPLETED"
                  : "IN_PROGRESS";

            const currentStage = reachedIndex < 0 ? null : stages[reachedIndex];
            const lastScanAt =
              reachedIndex < 0
                ? arrivedAt
                : new Date(arrivedAt.getTime() + (reachedIndex + 1) * 2 * HOUR_MS);

            // Only samples that reached the analysis stage carry assay results,
            // and only those past dry preparation have been weighed.
            const analysed = reachedIndex >= stages.length - 2;
            const weighed = reachedIndex >= stages.length - 3;
            const analysedAt = new Date(arrivedAt.getTime() + (stages.length - 1) * 2 * HOUR_MS);

            const sackCount = randomInt(18, 30);
            const composed = composeSampleIdent({
              place: run.place,
              rockType: batch.rockType?.code,
              nonProd: batch.nonProd?.code,
              sir: batch.sir?.code,
              pit: batch.pit?.code,
              bargingNo: batch.bargingNo,
              sequenceNo: batch.sequenceNo,
              sampleNo: index + 1,
              sackCount,
            });
            const sampleIdent = composed && !taken.has(composed) ? composed : null;
            if (sampleIdent) taken.add(sampleIdent);
            const results = analysed
              ? {
                  ...dummyResults(rng),
                  ...dummyInstrument(rng, new Date(Math.min(analysedAt.getTime() + HOUR_MS, Date.now()))),
                  remarks: pick([...DUMMY_REMARKS]),
                }
              : {};

            await tx.sample.create({
              data: {
                sampleCode: sampleCodes[index],
                status,
                currentStageId: currentStage?.id ?? null,
                // When it entered the stage it is in, which is its last scan.
                // The floor board orders on this and the SLA counts overdue
                // from it, so leaving it empty makes both read as if nothing
                // had ever been scanned.
                stageEnteredAt: currentStage ? lastScanAt : null,
                createdById: admin.id,
                createdAt: arrivedAt,
                updatedAt: lastScanAt,
                labRecord: {
                  create: {
                    labCode: labCodes[index].labCode,
                    placeId: placeIdByCode.get(run.place)!,
                    shiftDate,
                    sequence: labCodes[index].sequence,
                    createdAt: arrivedAt,
                    updatedAt: lastScanAt,
                    rockTypeId: batch.rockType?.id ?? null,
                    nonProdId: batch.nonProd?.id ?? null,
                    sirId: batch.sir?.id ?? null,
                    pitId: batch.pit?.id ?? null,
                    bargingNo: batch.bargingNo,
                    sequenceNo: batch.sequenceNo,
                    sampleNo: index + 1,
                    sackCount,
                    sampleIdent,
                    ...(weighed ? dummyWeights(rng) : {}),
                    ...results,
                    updatedById: analysed ? analyst.id : database.id,
                    // Whoever entered the results, so the form names its operator.
                    ...(analysed
                      ? {
                          audits: {
                            create: {
                              changedById: analyst.id,
                              changedAt: analysedAt,
                              changes: { ni: { from: null, to: "ni" in results ? (results.ni as number) : null } },
                            },
                          },
                        }
                      : {}),
                  },
                },
                logs: {
                  create: Array.from({ length: Math.max(0, reachedIndex + 1) }, (_, step) => ({
                    stageId: stages[step].id,
                    operatorId: pick(operators).id,
                    scannedAt: new Date(arrivedAt.getTime() + (step + 1) * 2 * HOUR_MS),
                    notes: null,
                  })),
                },
              },
            });
            created++;
          }
        }
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
  }

  const [samples, labRecords, logs] = await Promise.all([
    prisma.sample.count(),
    prisma.labRecord.count(),
    prisma.sampleLog.count(),
  ]);

  console.log(
    `Created ${created} dummy sample(s) across ${DAYS} shift day(s).\n` +
      `Database now holds ${samples} sample(s), ${labRecords} lab record(s), ${logs} scan log(s).`
  );
}

main()
  .catch((error) => {
    console.error("Dummy seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
