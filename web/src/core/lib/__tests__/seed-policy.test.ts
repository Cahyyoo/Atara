import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEV_ADMIN,
  DEV_ANALISIS,
  DEV_DATABASE,
  DEV_DEMO_ACCOUNTS,
  DEV_EKSPLORASI_ADMIN,
  DEV_PREPARATOR,
  DEV_SUPER_ADMIN,
  MIN_SEED_PASSWORD_CHARS,
  resolveSeedAccounts,
} from "../../../../prisma/seed-policy";
import { PERSONAS, personaOf } from "@/core/lib/auth/permissions";

/**
 * A known admin password must never reach a production database.
 *
 * The development accounts have passwords anybody can read in seed-policy.ts,
 * the seed runs automatically under `prisma migrate reset`, and seeded
 * accounts have no second factor. Nothing used to stand between that and a
 * real server except somebody remembering.
 */
describe("seeding accounts", () => {
  it("creates the known development accounts on a laptop", () => {
    const decision = resolveSeedAccounts({ NODE_ENV: "development" });
    expect(decision).toEqual({ ok: true, admin: DEV_SUPER_ADMIN, demo: DEV_DEMO_ACCOUNTS });
  });

  it("gives every role in every department somebody to sign in as on a laptop", () => {
    const seeded = [
      "SUPER_ADMIN",
      ...DEV_DEMO_ACCOUNTS.map((demo) => personaOf({ role: demo.role, department: demo.department })),
    ].sort();
    expect(seeded).toEqual([...PERSONAS].sort());
  });

  /**
   * The refusal. Not a warning, not a default: no accounts, exit code set.
   */
  it("refuses to create anybody in production with the development passwords", () => {
    const decision = resolveSeedAccounts({ NODE_ENV: "production" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toMatch(/SEED_ADMIN_PASSWORD/);
  });

  it("creates only the super admin in production, with the password it was given", () => {
    const decision = resolveSeedAccounts({
      NODE_ENV: "production",
      SEED_ADMIN_PASSWORD: "a-real-admin-password",
    });
    expect(decision).toEqual({
      ok: true,
      admin: { ...DEV_SUPER_ADMIN, password: "a-real-admin-password" },
      // No demonstration accounts on a real server.
      demo: [],
    });
  });

  it("holds a supplied password to a higher floor than the sign-in form", () => {
    expect(MIN_SEED_PASSWORD_CHARS).toBeGreaterThan(8);
    const short = "x".repeat(MIN_SEED_PASSWORD_CHARS - 1);
    for (const NODE_ENV of ["production", "development"]) {
      const decision = resolveSeedAccounts({ NODE_ENV, SEED_ADMIN_PASSWORD: short });
      expect(decision.ok).toBe(false);
    }
  });

  it("treats a blank password as not supplied", () => {
    expect(resolveSeedAccounts({ NODE_ENV: "production", SEED_ADMIN_PASSWORD: "   " }).ok).toBe(
      false
    );
  });

  it("is what the seed actually runs", () => {
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");
    expect(seed).toContain("resolveSeedAccounts(process.env)");
    expect(seed).toContain("process.exitCode = 1");
    // The passwords live in the policy, not in the seed.
    expect(seed).not.toContain("Admin123!");
  });

  it("no longer publishes the passwords in the READMEs", () => {
    for (const path of [
      ["..", "README.md"],
      ["README.md"],
      ["..", "mobile", "README.md"],
    ]) {
      const readme = readFileSync(join(process.cwd(), ...path), "utf8");
      for (const account of [DEV_SUPER_ADMIN, DEV_ADMIN, DEV_EKSPLORASI_ADMIN, DEV_PREPARATOR, DEV_DATABASE, DEV_ANALISIS]) {
        expect(readme, path.join("/")).not.toContain(account.password);
      }
    }
  });
});
