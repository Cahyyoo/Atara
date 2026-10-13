import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { resolveSeedAccounts, type SeedAccount } from "./seed-policy";
import type { Department, Role } from "../src/core/lib/auth/permissions";

const prisma = new PrismaClient();

/**
 * The workflow. `name` is the fallback wording; what the screen shows comes
 * from the `stages.<key>` messages, in whichever language is selected.
 */
const STAGES = [
  {
    key: "RECEIVED",
    name: "DITERIMA",
    sequenceOrder: 1,
    description: "Sample received at the laboratory and logged in.",
  },
  {
    key: "WET_PREP",
    name: "PREP BASAH",
    sequenceOrder: 2,
    description: "Wet preparation: the sample is handled before it is dried.",
  },
  {
    key: "DRY_PREP",
    name: "PREP KERING",
    sequenceOrder: 3,
    description: "Dry preparation: drying, crushing and splitting before analysis.",
  },
  {
    key: "ANALYSIS",
    name: "ANALISA",
    sequenceOrder: 4,
    description: "Mineral content analysis using XRF/ICP.",
  },
  {
    key: "REPORT",
    name: "REPORT",
    sequenceOrder: 5,
    description: "Compiling and issuing the analysis report for the sample.",
  },
];

/** Creates the account if it is missing; never resets a password that exists. */
async function ensureAccount(account: SeedAccount, role: Role, department: Department | null) {
  await prisma.user.upsert({
    where: { email: account.email },
    update: { name: account.name },
    create: {
      name: account.name,
      email: account.email,
      password: await bcrypt.hash(account.password, 10),
      role,
      department,
    },
  });
}

async function main() {
  console.log("Seeding stages...");
  for (const stage of STAGES) {
    await prisma.stage.upsert({
      where: { sequenceOrder: stage.sequenceOrder },
      update: { key: stage.key, name: stage.name, description: stage.description },
      create: stage,
    });
  }

  /**
   * Accounts only where the policy allows. The stages above are harmless
   * anywhere; a known admin password on a production server is not, so that
   * decision is made in seed-policy.ts and refused loudly here.
   */
  const decision = resolveSeedAccounts(process.env);
  if (!decision.ok) {
    console.error(decision.reason);
    process.exitCode = 1;
    return;
  }

  console.log("Seeding users...");
  await ensureAccount(decision.admin, "SUPER_ADMIN", null);
  for (const { account, role, department } of decision.demo) {
    await ensureAccount(account, role, department);
  }

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
