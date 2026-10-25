import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * The CRM List the lab started from (its "Table CRM List" sheet): the OREAS
 * standards by test method, the blank's preferred values and the duplicate's.
 *
 * Written as the sheet shows them, decimal comma and all, and stored with a
 * decimal point like the rest of the eksplorasi data ("0,71" -> "0.71").
 * Text that is not a number ("<=10%") is kept as it is.
 *
 * Upserted on each row's name with nothing to update, so running this again
 * adds what is missing and never undoes an edit made on the CRM List page.
 */

/** Standart, Test Method, Ni, Co, Fe2O3, Al2O3, Cr2O3, MgO, SiO2, then the SD of each. */
const STANDARDS: readonly string[][] = [
  ["Oreas182", "Fusion XRF", "0,71", "0,07", "23,40", "4,07", "1,29", "3,16", "46,77", "0,0080", "0,0019", "0,1630", "0,0310", "0,0121", "0,0730", "0,2550"],
  ["Oreas182", "Fusion ICP", "0,71", "0,07", "23,62", "4,02", "1,28", "3,12", "46,54", "0,0190", "0,0028", "0,6390", "0,0700", "0,0437", "0,1370", "0,7030"],
  ["Oreas184", "Fusion XRF", "1,02", "0,09", "39,30", "4,62", "1,75", "3,05", "42,25", "0,0090", "0,0014", "0,1960", "0,0310", "0,0140", "0,0230", "0,1760"],
  ["Oreas184", "Fusion ICP", "1,02", "0,09", "39,42", "4,58", "1,75", "3,00", "42,19", "0,0190", "0,0030", "0,6670", "0,0950", "0,0461", "0,0670", "0,8070"],
  ["Oreas187", "Fusion XRF", "1,37", "0,06", "13,45", "2,80", "9,87", "17,99", "46,66", "0,0090", "0,0009", "0,1000", "0,0270", "0,0100", "0,1030", "0,2270"],
  ["Oreas187", "Fusion ICP", "1,37", "0,06", "13,40", "2,77", "9,87", "17,96", "46,37", "0,0230", "0,0025", "0,3640", "0,0550", "0,0245", "0,3700", "0,9050"],
  ["Oreas189", "Fusion XRF", "1,48", "0,03", "15,04", "2,09", "7,65", "23,09", "46,20", "0,0150", "0,0009", "0,0980", "0,0190", "0,0094", "0,1440", "0,2160"],
  ["Oreas189", "Fusion ICP", "1,47", "0,03", "14,94", "2,08", "7,64", "23,06", "46,08", "0,0220", "0,0016", "0,3090", "0,0440", "0,0203", "0,3300", "0,9120"],
  ["Oreas190", "Fusion XRF", "1,64", "0,09", "35,48", "6,00", "17,26", "6,91", "38,22", "0,0120", "0,0015", "0,1490", "0,0460", "0,0158", "0,0580", "0,1670"],
  ["Oreas190", "Fusion ICP", "1,62", "0,09", "35,40", "5,86", "17,12", "6,85", "38,05", "0,0280", "0,0045", "0,7220", "0,1060", "0,0449", "0,1840", "0,7100"],
  ["Oreas192", "Fusion XRF", "1,77", "0,04", "18,10", "2,76", "3,13", "21,32", "43,58", "0,0150", "0,0009", "0,0820", "0,0280", "0,0109", "0,1310", "0,1630"],
  ["Oreas192", "Fusion ICP", "1,75", "0,04", "18,14", "2,75", "3,10", "21,26", "43,45", "0,0380", "0,0017", "0,4350", "0,0580", "0,0216", "0,4550", "0,7040"],
  ["Oreas193", "Fusion XRF", "1,93", "0,05", "19,51", "3,08", "3,62", "20,25", "42,72", "0,0190", "0,0014", "0,1040", "0,0230", "0,0086", "0,1270", "0,1860"],
  ["Oreas193", "Fusion ICP", "1,91", "0,05", "19,43", "3,05", "3,56", "20,26", "42,49", "0,0330", "0,0018", "0,4670", "0,0480", "0,0248", "0,4610", "0,8160"],
];

const STANDARD_FIELDS = [
  "ni", "co", "fe2o3", "al2o3", "cr2o3", "mgo", "sio2",
  "sdNi", "sdCo", "sdFe2o3", "sdAl2o3", "sdCr2o3", "sdMgo", "sdSio2",
] as const;

const BLANKS = [{ label: "Preferred Value", ni: "0,01", co: "0,01", fe2o3: "10", cr2o3: "0,05" }];

const DUPLICATES = [{ label: "Preferred Value", r2: "0,9", rpd: "<=10%", overRpd: "10%" }];

/** "0,71" -> "0.71"; anything that is not a plain decimal number stays as written. */
const decimal = (value: string) => (/^-?\d+,\d+$/.test(value) ? value.replace(",", ".") : value);

const decimals = <T extends Record<string, string>>(row: T): T =>
  Object.fromEntries(Object.entries(row).map(([field, value]) => [field, decimal(value)])) as T;

async function main() {
  const author =
    (await prisma.user.findFirst({ where: { role: "ADMIN", department: "EKSPLORASI" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" } }));
  if (!author) throw new Error("No exploration admin or super admin found. Run `npm run db:seed` first.");
  const createdById = author.id;

  for (const [standard, testMethod, ...values] of STANDARDS) {
    const data = Object.fromEntries(STANDARD_FIELDS.map((field, index) => [field, decimal(values[index])]));
    await prisma.crmStandard.upsert({
      where: { standard_testMethod: { standard, testMethod } },
      update: {},
      create: { standard, testMethod, ...data, createdById },
    });
  }
  for (const blank of BLANKS) {
    await prisma.crmBlank.upsert({
      where: { label: blank.label },
      update: {},
      create: { ...decimals(blank), createdById },
    });
  }
  for (const duplicate of DUPLICATES) {
    await prisma.crmDuplicate.upsert({
      where: { label: duplicate.label },
      update: {},
      create: { ...decimals(duplicate), createdById },
    });
  }

  const [standards, blanks, duplicates] = await Promise.all([
    prisma.crmStandard.count(),
    prisma.crmBlank.count(),
    prisma.crmDuplicate.count(),
  ]);
  console.log(`CRM List: ${standards} standard, ${blanks} blank, ${duplicates} duplicate row(s), written as ${author.email}.`);
}

main()
  .catch((error) => {
    console.error("CRM seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
