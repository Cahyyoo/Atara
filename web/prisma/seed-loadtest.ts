/**
 * Volume seed for load testing. Never run against a real database: it adds
 * hundreds of accounts sharing one known password.
 *
 *   source ../load-tests/env.sh && npx tsx prisma/seed-loadtest.ts
 *
 * Writes, on top of `db:seed` + `db:seed-master`:
 *   - 350 operators + 40 web accounts (one per virtual user: a session slot
 *     holds one sign-in, so shared accounts would sign each other out)
 *   - ~240k historical samples over 1,500 shift days, mostly completed
 *   - a 30k "scan pool" of fresh, unscanned samples from the last 30 days that
 *     the k6 operators walk through the five stages (reset with
 *     load-tests/reset-pool.sql between runs)
 *   - every sample's lab record and scan logs (~1.1M), ~500k lab record
 *     audits, 200k sign-in audits, 50k ended sessions
 *
 * Sample codes stay below 99,999 per year on purpose; see the report.
 *
 * Also writes ../load-tests/data/{users,pool}.json for the k6 scripts.
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, type Prisma, type SampleStatus } from "@prisma/client";
import { formatLabCode } from "@/modules/lab/lib/samples/lab-code";
import { getShiftDate, SHIFT_START_HOUR, SHIFT_TIMEZONE_OFFSET_MINUTES } from "@/modules/lab/lib/stages/shift-date";
import { composeSampleIdent } from "@/modules/lab/lib/samples/sample-ident";
import { createRandom, dummyInstrument, dummyResults, dummyWeights } from "./dummy-values";

const prisma = new PrismaClient();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const OPERATORS = 350;
const WEB_ACCOUNTS = { ADMIN: 15, DATABASE: 10, ANALISIS: 15 } as const;
const HISTORY_DAYS = 1500;
const HISTORY_PER_DAY = 160;
const POOL_DAYS = 30;
const POOL_PER_DAY = 1000;
const CHUNK = 1000;
const PASSWORD = process.env.LOADTEST_PASSWORD ?? "LoadTest123!";

const rng = createRandom(424242);

function shiftStart(shiftDate: Date): Date {
  const offsetHours = SHIFT_TIMEZONE_OFFSET_MINUTES / 60 - SHIFT_START_HOUR;
  return new Date(shiftDate.getTime() - offsetHours * HOUR_MS);
}

async function inChunks<T>(label: string, rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  const started = Date.now();
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK));
  }
  console.log(`  ${label}: ${rows.length} rows in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("atara_loadtest")) {
    throw new Error("Refusing to run: DATABASE_URL is not the atara_loadtest database.");
  }
  if ((await prisma.user.count({ where: { email: { startsWith: "lt-" } } })) > 0) {
    throw new Error("Load-test data already present. `docker compose down -v` to start over.");
  }

  const stages = await prisma.stage.findMany({ orderBy: { sequenceOrder: "asc" } });
  const options = await prisma.masterOption.findMany({ where: { isActive: true } });
  if (stages.length !== 5 || options.length === 0) {
    throw new Error("Run `npm run db:seed` and `npm run db:seed-master` first.");
  }
  const ofKind = (kind: string) => options.filter((option) => option.kind === kind);
  const places = ofKind("PLACE");
  const rockTypes = ofKind("ROCK_TYPE");
  const sirs = ofKind("SIR");
  const pits = ofKind("PIT");
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });

  // ---- accounts -----------------------------------------------------------
  console.log("Accounts...");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const users: Prisma.UserCreateManyInput[] = [];
  const operatorIds: string[] = [];
  const out = { password: PASSWORD, operators: [] as string[], ADMIN: [] as string[], DATABASE: [] as string[], ANALISIS: [] as string[] };
  for (let i = 1; i <= OPERATORS; i++) {
    const id = `ltu_op_${i}`;
    const email = `lt-op-${String(i).padStart(3, "0")}@atara.local`;
    users.push({ id, name: `LT Operator ${i}`, email, password: hash, role: "PREPARATOR" });
    operatorIds.push(id);
    out.operators.push(email);
  }
  for (const [role, count] of Object.entries(WEB_ACCOUNTS) as [keyof typeof WEB_ACCOUNTS, number][]) {
    for (let i = 1; i <= count; i++) {
      const email = `lt-${role.toLowerCase()}-${String(i).padStart(2, "0")}@atara.local`;
      users.push({ id: `ltu_${role.toLowerCase()}_${i}`, name: `LT ${role} ${i}`, email, password: hash, role, guideSeenAt: new Date() });
      out[role].push(email);
    }
  }
  await prisma.user.createMany({ data: users });
  const analystIds = out.ANALISIS.map((_, i) => `ltu_analisis_${i + 1}`);

  // ---- samples, lab records, logs ----------------------------------------
  console.log("Building rows...");
  const today = getShiftDate();
  type Plan = { shiftDate: Date; arrivedAt: Date; reached: number; pool: boolean };
  const plans: Plan[] = [];
  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset--) {
    const shiftDate = new Date(today.getTime() - offset * DAY_MS);
    const start = shiftStart(shiftDate).getTime();
    for (let n = 0; n < HISTORY_PER_DAY; n++) {
      const arrivedAt = new Date(Math.min(start + rng.int(0, 20) * HOUR_MS + rng.int(0, 3599) * 1000, Date.now() - 12 * HOUR_MS));
      const reached = offset <= 2 ? rng.int(-1, 4) : rng.random() < 0.85 ? 4 : rng.int(0, 3);
      plans.push({ shiftDate, arrivedAt, reached, pool: false });
    }
    if (offset < POOL_DAYS) {
      for (let n = 0; n < POOL_PER_DAY; n++) {
        const arrivedAt = new Date(Math.min(start + rng.int(0, 20) * HOUR_MS + rng.int(0, 3599) * 1000, Date.now() - 12 * HOUR_MS));
        plans.push({ shiftDate, arrivedAt, reached: -1, pool: true });
      }
    }
  }
  plans.sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime());

  const perYear = new Map<number, number>();
  const perShift = new Map<number, number>();
  const samples: Prisma.SampleCreateManyInput[] = [];
  const records: Prisma.LabRecordCreateManyInput[] = [];
  const logs: Prisma.SampleLogCreateManyInput[] = [];
  const audits: Prisma.LabRecordAuditCreateManyInput[] = [];
  const pool: string[] = [];
  let barging = 1000;

  plans.forEach((plan, index) => {
    const year = plan.shiftDate.getUTCFullYear();
    const yearSeq = (perYear.get(year) ?? 0) + 1;
    perYear.set(year, yearSeq);
    const shiftSeq = (perShift.get(plan.shiftDate.getTime()) ?? 0) + 1;
    perShift.set(plan.shiftDate.getTime(), shiftSeq);

    const id = `lts_${index}`;
    const sampleCode = `SMPL-${year}-${String(yearSeq).padStart(5, "0")}`;
    const stage = plan.reached >= 0 ? stages[plan.reached] : null;
    const lastScanAt = stage ? new Date(plan.arrivedAt.getTime() + (plan.reached + 1) * 2 * HOUR_MS) : plan.arrivedAt;
    const status: SampleStatus = !stage ? "PENDING" : plan.reached === 4 ? "COMPLETED" : "IN_PROGRESS";
    if (plan.pool) pool.push(sampleCode);

    samples.push({
      id,
      sampleCode,
      status,
      currentStageId: stage?.id ?? null,
      stageEnteredAt: stage ? lastScanAt : null,
      createdById: admin.id,
      createdAt: plan.arrivedAt,
      updatedAt: lastScanAt,
    });

    const analysed = plan.reached >= 3;
    if (index % 4 === 0) barging += 1;
    const place = rng.pick(places);
    const sampleNo = (index % 4) + 1;
    const sackCount = rng.int(18, 30);
    const ident = composeSampleIdent({
      place: place.code,
      rockType: rockTypes.length ? rng.pick(rockTypes).code : null,
      sir: sirs.length ? rng.pick(sirs).code : null,
      pit: pits.length ? rng.pick(pits).code : null,
      bargingNo: `B${barging}`,
      sequenceNo: index,
      sampleNo,
      sackCount,
    });
    records.push({
      id: `ltr_${index}`,
      sampleId: id,
      labCode: formatLabCode(plan.shiftDate, shiftSeq),
      shiftDate: plan.shiftDate,
      sequence: shiftSeq,
      placeId: place.id,
      bargingNo: `B${barging}`,
      sequenceNo: index,
      sampleNo,
      sackCount,
      sampleIdent: ident,
      ...(plan.reached >= 2 ? dummyWeights(rng) : {}),
      ...(analysed ? { ...dummyResults(rng), ...dummyInstrument(rng, lastScanAt) } : {}),
      updatedById: analysed ? rng.pick(analystIds) : null,
      createdAt: plan.arrivedAt,
      updatedAt: lastScanAt,
    });

    for (let step = 0; step <= plan.reached; step++) {
      logs.push({
        id: `ltl_${index}_${step}`,
        sampleId: id,
        stageId: stages[step].id,
        operatorId: rng.pick(operatorIds),
        scannedAt: new Date(plan.arrivedAt.getTime() + (step + 1) * 2 * HOUR_MS),
      });
    }
    if (analysed) {
      const edits = rng.int(1, 4);
      for (let e = 0; e < edits; e++) {
        audits.push({
          id: `lta_${index}_${e}`,
          labRecordId: `ltr_${index}`,
          changedById: rng.pick(analystIds),
          changedAt: new Date(lastScanAt.getTime() + e * HOUR_MS),
          changes: { ni: { from: e === 0 ? null : 1.1, to: 1.2 } },
        });
      }
    }
  });

  console.log(`Writing ${samples.length} samples (pool ${pool.length}); per year:`, Object.fromEntries(perYear));
  await inChunks("samples", samples, (data) => prisma.sample.createMany({ data }));
  await inChunks("lab_records", records, (data) => prisma.labRecord.createMany({ data }));
  await inChunks("sample_logs", logs, (data) => prisma.sampleLog.createMany({ data }));
  await inChunks("lab_record_audits", audits, (data) => prisma.labRecordAudit.createMany({ data }));

  // ---- sign-in trail and old sessions -------------------------------------
  const allIds = users.map((user) => user.id!);
  const signIns: Prisma.SignInAuditCreateManyInput[] = [];
  for (let i = 0; i < 200_000; i++) {
    signIns.push({
      id: `ltsa_${i}`,
      userId: rng.pick(allIds),
      outcome: rng.random() < 0.9 ? "PASSWORD_ONLY" : "PASSWORD_FAILED",
      createdAt: new Date(Date.now() - rng.int(0, HISTORY_DAYS) * DAY_MS - rng.int(0, 86_399) * 1000),
    });
  }
  await inChunks("sign_in_audits", signIns, (data) => prisma.signInAudit.createMany({ data }));
  const sessions: Prisma.UserSessionCreateManyInput[] = [];
  for (let i = 0; i < 50_000; i++) {
    const createdAt = new Date(Date.now() - rng.int(1, 365) * DAY_MS);
    sessions.push({
      id: `ltss_${i}`,
      userId: rng.pick(allIds),
      client: rng.random() < 0.7 ? "MOBILE" : "WEB",
      device: "Load test",
      createdAt,
      endedAt: new Date(createdAt.getTime() + 8 * HOUR_MS),
      endedReason: "LOGOUT",
    });
  }
  await inChunks("user_sessions", sessions, (data) => prisma.userSession.createMany({ data }));

  // ---- k6 inputs ----------------------------------------------------------
  const dataDir = path.resolve(__dirname, "../../load-tests/data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(dataDir, "pool.json"), JSON.stringify(pool));
  // Completed samples with many logs, for the detail and search scenarios.
  const completed = samples.filter((s) => s.status === "COMPLETED").filter((_, i) => i % 97 === 0).slice(0, 2000);
  fs.writeFileSync(path.join(dataDir, "completed.json"), JSON.stringify(completed.map((s) => s.sampleCode)));
  console.log(`Done. Data files in ${dataDir}`);
}

main()
  .catch((error) => {
    console.error("Load-test seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
