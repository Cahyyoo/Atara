/**
 * Which accounts the seed may create, and with what.
 *
 * Pure, so it can be tested without a database. The seed itself only runs
 * what this decides.
 *
 * The development accounts have known passwords -- they are in this file --
 * and that is fine for a laptop. It is not fine for a lab's real server, and
 * nothing used to stop it: `prisma migrate reset` runs the seed, the
 * passwords were printed in three READMEs, and the seeded accounts have no
 * second factor at all. So in production the seed refuses to create anybody
 * unless an admin password is supplied on purpose, and the demonstration
 * accounts are never created there.
 */

import type { Role } from "../src/lib/permissions";

export interface SeedAccount {
  email: string;
  name: string;
  password: string;
}

/** A demonstration account, one per role that is not the admin. */
export interface DemoAccount {
  account: SeedAccount;
  role: Exclude<Role, "ADMIN">;
}

/** Development only. Known, and meant to be. */
export const DEV_ADMIN: SeedAccount = {
  email: "admin@atara.local",
  name: "Main Admin",
  password: "Admin123!",
};
export const DEV_OPERATOR: SeedAccount = {
  email: "operator@atara.local",
  name: "Field Operator",
  password: "Operator123!",
};
export const DEV_DATABASE: SeedAccount = {
  email: "database@atara.local",
  name: "Database Staff",
  password: "Database123!",
};
export const DEV_ANALISIS: SeedAccount = {
  email: "analisis@atara.local",
  name: "Lab Analyst",
  password: "Analisis123!",
};

/** Every role gets somebody to sign in as on a laptop. */
export const DEV_DEMO_ACCOUNTS: DemoAccount[] = [
  { account: DEV_DATABASE, role: "DATABASE" },
  { account: DEV_ANALISIS, role: "ANALISIS" },
  { account: DEV_OPERATOR, role: "OPERATOR" },
];

/** Longer than the sign-in form's own floor: this one guards an admin. */
export const MIN_SEED_PASSWORD_CHARS = 12;

export type SeedDecision =
  | { ok: true; admin: SeedAccount; demo: DemoAccount[] }
  | { ok: false; reason: string };

export function resolveSeedAccounts(env: {
  NODE_ENV?: string;
  SEED_ADMIN_PASSWORD?: string;
}): SeedDecision {
  const production = env.NODE_ENV === "production";
  const supplied = env.SEED_ADMIN_PASSWORD?.trim() || undefined;

  if (supplied !== undefined && supplied.length < MIN_SEED_PASSWORD_CHARS) {
    return {
      ok: false,
      reason: `SEED_ADMIN_PASSWORD must be at least ${MIN_SEED_PASSWORD_CHARS} characters.`,
    };
  }

  if (production) {
    if (!supplied) {
      return {
        ok: false,
        reason:
          "Refusing to seed accounts in production with the development passwords. " +
          "Set SEED_ADMIN_PASSWORD to create the admin account, and change it after " +
          "the first sign-in.",
      };
    }
    // No demonstration accounts on a real server: accounts nobody asked for,
    // with passwords somebody could look up.
    return { ok: true, admin: { ...DEV_ADMIN, password: supplied }, demo: [] };
  }

  return {
    ok: true,
    admin: supplied ? { ...DEV_ADMIN, password: supplied } : DEV_ADMIN,
    demo: DEV_DEMO_ACCOUNTS,
  };
}
