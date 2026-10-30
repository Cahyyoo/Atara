import { PrismaClient, type Prisma, type SampleType } from "@prisma/client";
import { createDataSourceSchema } from "@/modules/eksplorasi/validation";
import { createRandom } from "./dummy-values";

/**
 * A little demonstration data for the exploration module: drill-hole assays
 * with the QC samples a lab slips in among them, so the four lists and every
 * dashboard section have something to show. The CRM List is read, never
 * written: the standards are assayed about its certified values.
 *
 * - two campaigns of three holes, one metre a sample, down to 8-12 m, over
 *   the last fifty days (so two months to pick from);
 * - after about every 8th sample a standard from the CRM List (Fusion XRF),
 *   within about 2 SD of its value, now and then 2.5-3.5 SD off it;
 * - after about every 12th a blank: a few thousandths, now and then past the
 *   CRM List's 0.01;
 * - after about every 9th a duplicate of the sample before it, its Remarks
 *   naming that sample, its values within a few percent -- now and then 12-18%.
 *
 * Every row is checked against the app's own rules before anything is
 * written (no "<0.01", numbers where numbers go, a duplicate's Remarks a FIELD
 * sample), so the data is what the sheet and the import would let in.
 *
 * Every Sample ID starts with DMY-. A re-run removes those rows and writes them
 * again, the same each time (a seeded generator); other rows are left alone.
 *
 *     npm run db:seed-eksplorasi-dummy
 */

const prisma = new PrismaClient();
const rng = createRandom(20261030);
const DAY_MS = 24 * 60 * 60 * 1000;

const PREFIX = "DMY-";
const CAMPAIGNS = [
  { name: "DMY-2026-A", code: "A" },
  { name: "DMY-2026-B", code: "B" },
] as const;
const HOLES_PER_CAMPAIGN = 3;
/** How far back the sampling dates reach. */
const DAYS = 50;
/** The standards to slip in, by their CRM List name; the first three certified otherwise. */
const PREFERRED_STANDARDS = ["Oreas184", "Oreas187", "Oreas190"];
const CRM_ELEMENTS = ["ni", "co", "fe2o3", "al2o3", "cr2o3", "mgo", "sio2"] as const;

type Elements = Record<
  "ni" | "fe" | "fe2o3" | "co" | "na2o" | "mgo" | "al2o3" | "sio2" | "p2o5" | "so3" | "k2o" | "cao" | "tio2" | "cr2o3" | "mno" | "mc",
  string | null
>;

/** A CRM standard as the seed uses it: the name the data source writes, and value/SD per element. */
interface Standard {
  control: string;
  crmName: string;
  certified: Partial<Record<(typeof CRM_ELEMENTS)[number], { value: number; sd: number }>>;
}

const text = (value: number, places: number) => value.toFixed(places);
const day = (date: Date) => date.toISOString().slice(0, 10);
/** How many decimals a value of this size is written with. */
const placesOf = (value: number) => (value < 0.1 ? 4 : value < 10 ? 3 : 2);

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

/** A standard's analysis: within about 2 SD of each certified value, one in eight 2.5-3.5 SD off. */
function standardAssay(standard: Standard): Elements {
  const off = rng.random() < 0.125;
  const assay = lateriteAssay(0, 1);
  for (const element of CRM_ELEMENTS) {
    const certified = standard.certified[element];
    if (!certified) continue;
    const spread = off ? rng.pick([-1, 1]) * rng.decimal(2.5, 3.5, 2) : rng.decimal(-1.8, 1.8, 2);
    const value = certified.value + spread * certified.sd;
    assay[element] = text(value, placesOf(value));
  }
  const fe2o3 = Number(assay.fe2o3);
  if (Number.isFinite(fe2o3)) assay.fe = text(fe2o3 / 1.4297, 2);
  return assay;
}

/** A blank: next to nothing -- a few thousandths, one in eight past the CRM List's 0.01. */
function blankAssay(): Elements {
  const trace = () => text(rng.random() < 0.125 ? rng.decimal(0.011, 0.03) : rng.decimal(0.001, 0.009), 3);
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
    cr2o3: text(rng.decimal(0.005, 0.045), 3),
    mno: trace(),
    mc: text(rng.decimal(0.1, 1), 2),
  };
}

/** A duplicate: the original's values within about 3%, one in six 12-18% off. */
function duplicateAssay(original: Elements): Elements {
  const off = rng.random() < 1 / 6 ? rng.pick([-1, 1]) * rng.decimal(0.12, 0.18, 3) : 0;
  return Object.fromEntries(
    Object.entries(original).map(([key, value]) => {
      const number = Number(value);
      if (value === null || !Number.isFinite(number)) return [key, value];
      const places = value.split(".")[1]?.length ?? 2;
      return [key, text(number * (1 + off) * rng.decimal(0.97, 1.03, 4), places)];
    })
  ) as Elements;
}

/** The standards to assay, from the CRM List's Fusion XRF rows. */
async function crmStandards(): Promise<Standard[]> {
  const rows = await prisma.crmStandard.findMany({ where: { testMethod: "Fusion XRF" }, orderBy: { standard: "asc" } });
  const preferred = rows.filter((row) => PREFERRED_STANDARDS.includes(row.standard));
  const chosen = preferred.length > 0 ? preferred : rows.slice(0, 3);
  return chosen.map((row) => {
    const values = row as unknown as Record<string, string | null>;
    const certified: Standard["certified"] = {};
    for (const element of CRM_ELEMENTS) {
      const value = Number(values[element]);
      const sd = Number(values[`sd${element.charAt(0).toUpperCase()}${element.slice(1)}`]);
      if (values[element] && Number.isFinite(value) && Number.isFinite(sd) && sd > 0) certified[element] = { value, sd };
    }
    // "Oreas184" in the CRM List, "OREAS-184" on the data source: the dashboard matches either.
    return { control: row.standard.replace(/^oreas/i, "OREAS-"), crmName: row.standard, certified };
  });
}

function buildRows(createdById: string, standards: Standard[]): Prisma.DataSourceCreateManyInput[] {
  const rows: Prisma.DataSourceCreateManyInput[] = [];
  const today = new Date(`${day(new Date())}T00:00:00.000Z`).getTime();
  let serial = 0;
  let standardCount = 0;
  let blanks = 0;
  let duplicates = 0;
  let nextStandard = rng.int(6, 10);
  let nextBlank = rng.int(10, 14);
  let nextDuplicate = rng.int(7, 11);

  const push = (
    sampleType: SampleType,
    fields: Omit<Prisma.DataSourceCreateManyInput, "sampleId" | "sampleType" | "createdById">,
    sampleId: string
  ) => rows.push({ ...fields, sampleId, sampleType, createdById });

  for (const campaign of CAMPAIGNS) {
    for (let hole = 1; hole <= HOLES_PER_CAMPAIGN; hole++) {
      const holeId = `${PREFIX}${campaign.code}-DH${String(hole).padStart(2, "0")}`;
      const depth = rng.int(8, 12);
      // A hole is drilled and logged over a few days.
      const started = today - rng.int(3, DAYS) * DAY_MS;
      for (let metre = 0; metre < depth; metre++) {
        serial += 1;
        const date = new Date(started + Math.floor(metre / 4) * DAY_MS);
        const sampleId = `${PREFIX}${campaign.code}-${String(serial).padStart(5, "0")}`;
        const assay = lateriteAssay(metre, depth);
        const common = { campaign: campaign.name, holeId, date, weight: text(rng.decimal(1.5, 3.5), 2) };
        push("FIELD", { ...common, from: text(metre, 1), to: text(metre + 1, 1), ...assay }, sampleId);

        if (serial >= nextDuplicate) {
          duplicates += 1;
          nextDuplicate = serial + rng.int(7, 11);
          push(
            "DUPLICATE",
            {
              ...common,
              controlDate: day(date),
              control: sampleId,
              no: String(duplicates),
              from: text(metre, 1),
              to: text(metre + 1, 1),
              // The original, as the Duplicate list's dropdown picks it.
              originalSampleIdRemarks: sampleId,
              ...duplicateAssay(assay),
            },
            `${sampleId}-D`
          );
        }
        if (serial >= nextStandard && standards.length > 0) {
          standardCount += 1;
          nextStandard = serial + rng.int(6, 10);
          const standard = rng.pick(standards);
          push(
            "STANDARD",
            { ...common, control: standard.control, oreasRemarks: standard.crmName, ...standardAssay(standard) },
            `${PREFIX}STD-${String(standardCount).padStart(4, "0")}`
          );
        }
        if (serial >= nextBlank) {
          blanks += 1;
          nextBlank = serial + rng.int(10, 14);
          push(
            "BLANK",
            { ...common, control: "BLANK-QZ", oreasRemarks: `Inserted after ${sampleId}`, ...blankAssay() },
            `${PREFIX}BLK-${String(blanks).padStart(4, "0")}`
          );
        }
      }
    }
  }
  return rows;
}

/**
 * The rows held to the rules the sheet, the import and the API hold a row to:
 * the input schema, and a duplicate's Remarks naming a FIELD sample among them.
 * Every problem is listed; nothing is written while there is one.
 */
function checkRows(rows: readonly Prisma.DataSourceCreateManyInput[]): string[] {
  const fieldIds = new Set(rows.filter((row) => row.sampleType === "FIELD").map((row) => row.sampleId.toLowerCase()));
  return rows.flatMap((row) => {
    // The schema keeps only its own columns: the author is left out on its own.
    const parsed = createDataSourceSchema.safeParse({ ...row, date: row.date ? day(new Date(row.date)) : null });
    const problems = parsed.success ? [] : parsed.error.issues.map((issue) => `${row.sampleId} ${issue.path.join(".")}: ${issue.message}`);
    const original = row.originalSampleIdRemarks;
    if (original && !fieldIds.has(original.toLowerCase())) problems.push(`${row.sampleId} Remarks: "${original}" is not a FIELD sample`);
    return problems;
  });
}

async function main() {
  const author =
    (await prisma.user.findUnique({ where: { email: "eksplorasi@atara.local" } })) ??
    (await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }));
  if (!author) throw new Error("No exploration admin or administrator found. Run `npm run db:seed` first.");

  const standards = await crmStandards();
  if (standards.length === 0) console.warn("The CRM List has no Fusion XRF standard: no standards are written.");

  const rows = buildRows(author.id, standards);
  const problems = checkRows(rows);
  if (problems.length > 0) throw new Error(`The dummy rows break the app's rules:\n${problems.join("\n")}`);

  const removed = await prisma.dataSource.deleteMany({ where: { sampleId: { startsWith: PREFIX } } });
  await prisma.dataSource.createMany({ data: rows });

  const counts = rows.reduce<Record<string, number>>((total, row) => {
    total[row.sampleType] = (total[row.sampleType] ?? 0) + 1;
    return total;
  }, {});
  console.log(`Checked ${rows.length} rows against the app's rules. Removed ${removed.count} earlier dummy rows; wrote:`, counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
