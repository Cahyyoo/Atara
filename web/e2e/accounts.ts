/** Seeded demo accounts (prisma/seed-policy.ts) and where their sessions are saved. */
export const ACCOUNTS = {
  admin: { email: "admin@atara.local", password: "Admin123!" },
  database: { email: "database@atara.local", password: "Database123!" },
} as const;

export type Role = keyof typeof ACCOUNTS;

export const storageStatePath = (role: Role) => `e2e/.auth/${role}.json`;
