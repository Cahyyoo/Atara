import { PrismaClient, type MasterKind } from "@prisma/client";

const prisma = new PrismaClient();

/** The vocabularies the lab starts with; admins add to them from /master-data. */
const SEED: Record<MasterKind, string[]> = {
  PLACE: ["LAM", "MOL"],
  ROCK_TYPE: ["SAP", "LIM"],
  NON_PROD: ["TP", "BG"],
  PIT: ["A4", "A11"],
  SIR: ["1", "2", "3"],
};

async function main() {
  for (const [kind, codes] of Object.entries(SEED) as [MasterKind, string[]][]) {
    for (const [index, code] of codes.entries()) {
      // Upsert, so re-running never duplicates and never resets a renamed label.
      await prisma.masterOption.upsert({
        where: { kind_code: { kind, code } },
        update: {},
        create: { kind, code, sortOrder: index },
      });
    }
    console.log(`${kind.padEnd(10)} ${codes.join(", ")}`);
  }

  console.log(`\nTotal options: ${await prisma.masterOption.count()}`);
}

main()
  .catch((error) => {
    console.error("Master seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
