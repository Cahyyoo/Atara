/**
 * One account per k6 virtual user and role: lt-vu-<role>-NNN@atara.local.
 *
 * k6 numbers its VUs across every scenario in a run (exec.vu.idInTest), so an
 * account named after that number is never shared by two VUs -- and a shared
 * account would end the other VU's session (one sign-in per slot).
 */
import bcrypt from "bcryptjs";
import { PrismaClient, type UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const PER_ROLE = 500;
const ROLES: UserRole[] = ["PREPARATOR", "ADMIN", "DATABASE", "ANALISIS"];

async function main() {
  if (!process.env.DATABASE_URL?.includes("atara_loadtest")) {
    throw new Error("Refusing to run: DATABASE_URL is not the atara_loadtest database.");
  }
  const hash = await bcrypt.hash(process.env.LOADTEST_PASSWORD ?? "LoadTest123!", 10);
  for (const role of ROLES) {
    const data = Array.from({ length: PER_ROLE }, (_, i) => ({
      id: `ltvu_${role.toLowerCase()}_${i + 1}`,
      name: `VU ${role} ${i + 1}`,
      email: `lt-vu-${role.toLowerCase()}-${String(i + 1).padStart(3, "0")}@atara.local`,
      password: hash,
      role,
      // Every role the load test drives works in the lab.
      department: "LAB" as const,
      guideSeenAt: new Date(),
    }));
    const { count } = await prisma.user.createMany({ data, skipDuplicates: true });
    console.log(`${role}: ${count} created`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
