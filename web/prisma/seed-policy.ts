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
 *
 * The account the seed always creates is the super admin: the one account
 * nobody else can create (user-scope.ts), and the one that creates the
 * departments' admins. On a laptop there is also somebody for every role in
 * every department.
 */

import type { Department, Role } from "../src/core/lib/auth/permissions";

export interface SeedAccount {
  email: string;
  name: string;
  password: string;
}

/** A demonstration account: a role in a department, below the super admin. */
export interface DemoAccount {
  account: SeedAccount;
  role: Exclude<Role, "SUPER_ADMIN">;
  department: Department;
}

/** Development only. Known, and meant to be. */
export const DEV_SUPER_ADMIN: SeedAccount = {
  email: "superadmin@atara.local",
  name: "Super Admin",
  password: "SuperAdmin123!",
};
export const DEV_ADMIN: SeedAccount = {
  email: "admin@atara.local",
  name: "Lab Admin",
  password: "Admin123!",
};
export const DEV_EKSPLORASI_ADMIN: SeedAccount = {
  email: "eksplorasi@atara.local",
  name: "Eksplorasi Admin",
  password: "Eksplorasi123!",
};
export const DEV_PREPARATOR: SeedAccount = {
  email: "preparator@atara.local",
  name: "Field Preparator",
  password: "Preparator123!",
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

/** Every role in every department gets somebody to sign in as on a laptop. */
export const DEV_DEMO_ACCOUNTS: DemoAccount[] = [
  { account: DEV_ADMIN, role: "ADMIN", department: "LAB" },
  { account: DEV_DATABASE, role: "DATABASE", department: "LAB" },
  { account: DEV_ANALISIS, role: "ANALISIS", department: "LAB" },
  { account: DEV_PREPARATOR, role: "PREPARATOR", department: "LAB" },
  { account: DEV_EKSPLORASI_ADMIN, role: "ADMIN", department: "EKSPLORASI" },
];

/** Longer than the sign-in form's own floor: this one guards the super admin. */
export const MIN_SEED_PASSWORD_CHARS = 12;

export type SeedDecision =
  | { ok: true; admin: SeedAccount; demo: DemoAccount[] }
  | { ok: false; reason: string };

/**
 * Whether the database lives on this machine.
 *
 * `npm run db:seed` and `prisma migrate reset` set no NODE_ENV, so on a real
 * server the production check below used to read "development" and create
 * every account with its password from this file. A database on another host
 * is never a laptop's, so it counts as production whatever NODE_ENV says. An
 * address that does not parse counts as remote: the safe side.
 */
export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function resolveSeedAccounts(env: {
  NODE_ENV?: string;
  SEED_ADMIN_PASSWORD?: string;
  DATABASE_URL?: string;
}): SeedDecision {
  const production = env.NODE_ENV === "production" || !isLocalDatabase(env.DATABASE_URL);
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
          "Set SEED_ADMIN_PASSWORD to create the super admin account, and change it after " +
          "the first sign-in.",
      };
    }
    // No demonstration accounts on a real server: accounts nobody asked for,
    // with passwords somebody could look up.
    return { ok: true, admin: { ...DEV_SUPER_ADMIN, password: supplied }, demo: [] };
  }

  return {
    ok: true,
    admin: supplied ? { ...DEV_SUPER_ADMIN, password: supplied } : DEV_SUPER_ADMIN,
    demo: DEV_DEMO_ACCOUNTS,
  };
}
