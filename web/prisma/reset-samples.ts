import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Wipes every sample, its scan history and its lab record so the LAM/MOL
 * numbering can start from a clean slate. Users and stages are kept.
 */
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error(
      "This deletes ALL samples, sample logs and lab records.\n" +
        "Re-run with --yes to confirm: npx tsx prisma/reset-samples.ts --yes"
    );
    process.exitCode = 1;
    return;
  }

  const logs = await prisma.sampleLog.deleteMany();
  const labRecords = await prisma.labRecord.deleteMany();
  const samples = await prisma.sample.deleteMany();

  console.log(
    `Deleted ${logs.count} sample log(s), ${labRecords.count} lab record(s), ${samples.count} sample(s).`
  );
}

main()
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
