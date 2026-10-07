import type { Role } from "@/lib/permissions";

/**
 * The message keys that name each role and say what it is for, under
 * `users.dialog`. One map for the users table, the role picker and the account
 * menu, which each used to write their own two-way ternary -- and a two-way
 * ternary silently calls every new role by the second name.
 */
export const ROLE_LABEL_KEYS = {
  ADMIN: { name: "roleAdmin", hint: "roleAdminHint" },
  DATABASE: { name: "roleDatabase", hint: "roleDatabaseHint" },
  ANALISIS: { name: "roleAnalisis", hint: "roleAnalisisHint" },
  OPERATOR: { name: "roleOperator", hint: "roleOperatorHint" },
} as const satisfies Record<Role, { name: string; hint: string }>;
