import { PrismaClient, type SampleStatus } from "@prisma/client";
import { generateSampleCodes } from "@/lib/sample-code";
import { allocateLabCodes } from "@/lib/lab-code";
import { getShiftDate, SHIFT_START_HOUR, SHIFT_TIMEZONE_OFFSET_MINUTES } from "@/lib/shift-date";

const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How many shift days back from today to fill, including today. */
const DAYS = 5;

/** Each shift day is filled from one of these, cycling through them. */
const RUNS: { place: string; quantity: number }[][] = [
  [
    { place: "LAM", quantity: 6 },
    { place: "MOL", quantity: 4 },
  ],
  [
    { place: "LAM", quantity: 8 },
    { place: "MOL", quantity: 5 },
  ],
  [
    { place: "LAM", quantity: 5 },
    { place: "MOL", quantity: 6 },
  ],
  [
    { place: "LAM", quantity: 7 },
    { place: "MOL", quantity: 4 },
  ],
  [
    { place: "LAM", quantity: 6 },
    { place: "MOL", quantity: 5 },
  ],
];

/** Deterministic RNG so re-running produces comparable data. */
let seed = 20260908;
function random(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function randomDecimal(min: number, max: number): number {
  return Number((min + random() * (max - min)).toFixed(3));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** The UTC instant a shift day starts (07:00 WITA). */
function shiftStart(shiftDate: Date): Date {
  const offsetHours = SHIFT_TIMEZONE_OFFSET_MINUTES / 60 - SHIFT_START_HOUR;
  return new Date(shiftDate.getTime() - offsetHours * HOUR_MS);
}

/** Typical nickel laterite assay values. */
function assayValues() {
  return {
    ni: randomDecimal(0.8, 2.4),
    fe: randomDecimal(10, 46),
    co: randomDecimal(0.02, 0.15),
    sio2: randomDecimal(15, 47),
    mgo: randomDecimal(2, 24),
    cao: randomDecimal(0.1, 1.8),
    al2o3: randomDecimal(1, 11),
    cr: randomDecimal(0.5, 2.5),
    fe2o3: randomDecimal(15, 60),
    cr2o3: randomDecimal(0.5, 3),
    mno: randomDecimal(0.1, 1.5),
    na2o: randomDecimal(0.01, 0.2),
    p2o5: randomDecimal(0.001, 0.05),
    tio2: randomDecimal(0.02, 0.4),
    s: randomDecimal(0.01, 0.15),
    co2: randomDecimal(1, 20),
    zn: randomDecimal(0.01, 0.1),
    sum: 100,
  };
}

const REMARKS = [
  "Re-assay requested by production.",
  "Sample slightly wet on arrival.",
  "Duplicate check within tolerance.",
  null,
  null,
  null,
];

async function main() {
  const stages = await prisma.stage.findMany({ orderBy: { sequenceOrder: "asc" } });
  if (stages.length === 0) {
    throw new Error("No stages found. Run `npm run db:seed` first.");
  }

  const users = await prisma.user.findMany();
  const admin = users.find((user) => user.role === "ADMIN");
  const operators = users.filter((user) => user.role === "OPERATOR");
  if (!admin || operators.length === 0) {
    throw new Error("Admin/operator users are missing. Run `npm run db:seed` first.");
  }

  // The place is master data too, and every lab record carries one.
  const places = await prisma.masterOption.findMany({
    where: { kind: "PLACE" },
    select: { id: true, code: true },
  });
  const placeIdByCode = new Map(places.map((place) => [place.code, place.id]));
  for (const code of new Set(RUNS.flat().map((run) => run.place))) {
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
    const runs = RUNS[(DAYS - 1 - dayOffset) % RUNS.length];

    await prisma.$transaction(
      async (tx) => {
        for (const run of runs) {
          const sampleCodes = await generateSampleCodes(
            run.quantity,
            shiftDate.getUTCFullYear(),
            tx
          );
          const labCodes = await allocateLabCodes(tx, run.quantity, shiftDate);

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

            // Only samples that reached the analysis stage carry assay results.
            const analysed = reachedIndex >= stages.length - 2;

            await tx.sample.create({
              data: {
                sampleCode: sampleCodes[index],
                status,
                currentStageId: currentStage?.id ?? null,
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
                    ...(analysed
                      ? { ...assayValues(), remarks: pick(REMARKS) }
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
