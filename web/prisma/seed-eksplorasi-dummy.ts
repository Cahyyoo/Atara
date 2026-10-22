import { PrismaClient, type Prisma, type SampleType } from "@prisma/client";
import { createRandom } from "./dummy-values";

/**
 * Demonstration data for the exploration module: drill-hole assays with the
 * QC samples a lab slips in among them, so the four lists and both dashboard
 * charts have something to show.
 *
 * - two campaigns of ten holes, one metre a sample, down to 15-30 m;
 * - after about every 11th sample a standard (OREAS-190, -184 or -187, close
 *   to its certified value, now and then well off it), after about every 15th a
 *   blank (next to nothing, some "<0.01"), and after about every 11th a
 *   duplicate of the sample before it (its Control names that sample, its
 *   values within a few percent of it).
 *
 * Every Sample ID starts with DMY-. A re-run removes those rows and writes them
 * again, the same each time (a seeded generator); other rows are left alone.
 *
 *     npm run db:seed-eksplorasi-dummy
 */

const prisma = new PrismaClient();
const rng = createRandom(20261022);
const DAY_MS = 24 * 60 * 60 * 1000;

const PREFIX = "DMY-";
const CAMPAIGNS = [
  { name: "DMY-2026-A", code: "A" },
  { name: "DMY-2026-B", code: "B" },
] as const;
const HOLES_PER_CAMPAIGN = 10;
/** How far back the sampling dates reach. */
const DAYS = 60;

/** Certified values of the standards, roughly as their sheets give them. */
const STANDARDS = {
  "OREAS-190": { ni: 1.84, fe: 47.2, co: 0.098, mgo: 3.1, sio2: 12.4 },
  "OREAS-184": { ni: 1.29, fe: 21.6, co: 0.061, mgo: 15.8, sio2: 38.9 },
  "OREAS-187": { ni: 2.31, fe: 16.9, co: 0.052, mgo: 22.4, sio2: 41.7 },
} as const;
type Control = keyof typeof STANDARDS;

type Elements = Record<
  "ni" | "fe" | "fe2o3" | "co" | "na2o" | "mgo" | "al2o3" | "sio2" | "p2o5" | "so3" | "k2o" | "cao" | "tio2" | "cr2o3" | "mno" | "mc",
  string | null
>;

const text = (value: number, places: number) => value.toFixed(places);
const day = (date: Date) => date.toISOString().slice(0, 10);

/** A laterite assay: limonite (iron-rich) near the top, saprolite (magnesian) lower down. */
function lateriteAssay(depth: number, maxDepth: number): Elements {
  const saprolite = depth / maxDepth;
  const fe = rng.decimal(45 - saprolite * 33, 50 - saprolite * 30, 2);
  return {
    ni: text(rng.decimal(0.8 + saprolite * 0.6, 1.4 + saprolite * 1.2), 2),
    fe: text(fe, 2),
    fe2o3: text(fe * 1.4297, 2),
    co: text(rng.decimal(0.02, 0.15), 3),
    na2o: text(rng.decimal(0.01, 0.05), 3),
    mgo: text(rng.decimal(2 + saprolite * 15, 6 + saprolite * 24), 2),
    al2o3: text(rng.decimal(2, 10), 2),
    sio2: text(rng.decimal(10 + saprolite * 20, 20 + saprolite * 25), 2),
    p2o5: text(rng.decimal(0.001, 0.02), 3),
    so3: text(rng.decimal(0.01, 0.2), 3),
    k2o: text(rng.decimal(0.005, 0.05), 3),
    cao: text(rng.decimal(0.05, 1.5), 2),
    tio2: text(rng.decimal(0.02, 0.15), 3),
    cr2o3: text(rng.decimal(1, 3.5), 2),
    mno: text(rng.decimal(0.2, 1), 2),
    mc: text(rng.decimal(20, 40), 2),
  };
}

/** A standard's analysis: within about 2% of its certified value, one in ten well off it. */
function standardAssay(control: Control): Elements {
  const certified = STANDARDS[control];
  const off = rng.random() < 0.1 ? rng.pick([0.9, 1.1]) : 1;
  const near = (value: number, places: number) => text(value * off * rng.decimal(0.98, 1.02, 4), places);
  return {
    ...lateriteAssay(0, 1),
    ni: near(certified.ni, 3),
    fe: near(certified.fe, 2),
    fe2o3: near(certified.fe * 1.4297, 2),
    co: near(certified.co, 3),
    mgo: near(certified.mgo, 2),
    sio2: near(certified.sio2, 2),
  };
}

/** A blank: next to nothing, some below the detection limit. */
function blankAssay(): Elements {
  const trace = () => (rng.random() < 0.3 ? "<0.01" : text(rng.decimal(0.001, 0.02), 3));
  return {
    ni: trace(),
    fe: text(rng.decimal(0.05, 0.4), 3),
    fe2o3: text(rng.decimal(0.07, 0.57), 3),
    co: trace(),
    na2o: trace(),
    mgo: text(rng.decimal(0.01, 0.1), 3),
    al2o3: text(rng.decimal(0.05, 0.3), 3),
    sio2: text(rng.decimal(95, 99.5), 2),
    p2o5: trace(),
    so3: trace(),
    k2o: trace(),
    cao: trace(),
    tio2: trace(),
    cr2o3: trace(),
    mno: trace(),
    mc: text(rng.decimal(0.1, 1), 2),
  };
}

/** A duplicate: the original's values within about 3%. */
function duplicateAssay(original: Elements): Elements {
  return Object.fromEntries(
    Object.entries(original).map(([key, value]) => {
      const number = Number(value);
      if (value === null || !Number.isFinite(number)) return [key, value];
      const places = value.split(".")[1]?.length ?? 2;
      return [key, text(number * rng.decimal(0.97, 1.03, 4), places)];
    })
  ) as Elements;
}

function buildRows(createdById: string): Prisma.DataSourceCreateManyInput[] {
  const rows: Prisma.DataSourceCreateManyInput[] = [];
  const today = new Date(`${day(new Date())}T00:00:00.000Z`).getTime();
  let serial = 0;
  let standards = 0;
  let blanks = 0;
  let duplicates = 0;
  let nextStandard = rng.int(8, 14);
  let nextBlank = rng.int(12, 18);
  let nextDuplicate = rng.int(8, 14);

  const push = (
    sampleType: SampleType,
    fields: Omit<Prisma.DataSourceCreateManyInput, "sampleId" | "sampleType" | "createdById">,
    sampleId: string
  ) => rows.push({ ...fields, sampleId, sampleType, createdById });

  for (const campaign of CAMPAIGNS) {
    for (let hole = 1; hole <= HOLES_PER_CAMPAIGN; hole++) {
      const holeId = `${PREFIX}${campaign.code}-DH${String(hole).padStart(2, "0")}`;
      const depth = rng.int(15, 30);
      // A hole is drilled and logged over a few days.
      const started = today - rng.int(5, DAYS) * DAY_MS;
      for (let metre = 0; metre < depth; metre++) {
        serial += 1;
        const date = new Date(started + Math.floor(metre / 8) * DAY_MS);
        const sampleId = `${PREFIX}${campaign.code}-${String(serial).padStart(5, "0")}`;
        const assay = lateriteAssay(metre, depth);
        const common = { campaign: campaign.name, holeId, date, weight: text(rng.decimal(1.5, 3.5), 2) };
        push("ORIGINAL", { ...common, from: text(metre, 1), to: text(metre + 1, 1), ...assay }, sampleId);

        if (serial >= nextDuplicate) {
          duplicates += 1;
          nextDuplicate = serial + rng.int(8, 14);
          push(
            "DUPLICATE",
            {
              ...common,
              controlDate: day(date),
              control: sampleId,
              no: String(duplicates),
              from: text(metre, 1),
              to: text(metre + 1, 1),
              remarks: "Field duplicate",
              ...duplicateAssay(assay),
            },
            `${sampleId}-D`
          );
        }
        if (serial >= nextStandard) {
          standards += 1;
          nextStandard = serial + rng.int(8, 14);
          const control = rng.pick(Object.keys(STANDARDS) as Control[]);
          push(
            "STANDARD",
            { ...common, control, remarks: `Inserted after ${sampleId}`, ...standardAssay(control) },
            `${PREFIX}STD-${String(standards).padStart(4, "0")}`
          );
        }
        if (serial >= nextBlank) {
          blanks += 1;
          nextBlank = serial + rng.int(12, 18);
          push(
            "BLANK",
            { ...common, control: "BLANK-QZ", remarks: `Inserted after ${sampleId}`, ...blankAssay() },
            `${PREFIX}BLK-${String(blanks).padStart(4, "0")}`
          );
        }
      }
    }
  }
  return rows;
}

async function main() {
  const author =
    (await prisma.user.findUnique({ where: { email: "eksplorasi@atara.local" } })) ??
    (await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }));
  if (!author) throw new Error("No exploration admin or administrator found. Run `npm run db:seed` first.");

  const rows = buildRows(author.id);
  const removed = await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: PREFIX } } });
  await prisma.dataSource.createMany({ data: rows });

  const counts = rows.reduce<Record<string, number>>((total, row) => {
    total[row.sampleType] = (total[row.sampleType] ?? 0) + 1;
    return total;
  }, {});
  console.log(`Removed ${removed.count} earlier dummy rows; wrote ${rows.length}:`, counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
