import { personaOf, type Access, type Department, type Persona, type Role } from "@/lib/permissions";

/**
 * The message keys that name each role and say what it is for, under
 * `users.dialog`. One map for the users table, the role picker and the account
 * menu, which each used to write their own two-way ternary -- and a two-way
 * ternary silently calls every new role by the second name.
 *
 * A bare role is what the role-wide settings speak of (announcement targets,
 * default passwords): "Admin" there is every department's admin.
 */
export const ROLE_LABEL_KEYS = {
  SUPER_ADMIN: { name: "roleSuperAdmin", hint: "roleSuperAdminHint" },
  ADMIN: { name: "roleAdmin", hint: "roleAdminHint" },
  DATABASE: { name: "roleDatabase", hint: "roleDatabaseHint" },
  ANALISIS: { name: "roleAnalisis", hint: "roleAnalisisHint" },
  OPERATOR: { name: "roleOperator", hint: "roleOperatorHint" },
} as const satisfies Record<Role, { name: string; hint: string }>;

/**
 * A person, rather than a role: the role in its department. What the users
 * table, the account menu and the guide call somebody.
 */
export const PERSONA_LABEL_KEYS = {
  SUPER_ADMIN: ROLE_LABEL_KEYS.SUPER_ADMIN,
  LAB_ADMIN: { name: "roleLabAdmin", hint: "roleLabAdminHint" },
  EKSPLORASI_ADMIN: { name: "roleEksplorasiAdmin", hint: "roleEksplorasiAdminHint" },
  DATABASE: ROLE_LABEL_KEYS.DATABASE,
  ANALISIS: ROLE_LABEL_KEYS.ANALISIS,
  OPERATOR: ROLE_LABEL_KEYS.OPERATOR,
} as const satisfies Record<Persona, { name: string; hint: string }>;

/** The label keys for an account; a pair that is not valid falls back to its role. */
export function personaLabelKeys(access: Access) {
  const persona = personaOf(access);
  return persona ? PERSONA_LABEL_KEYS[persona] : ROLE_LABEL_KEYS[access.role];
}

/** Under `users.dialog`, beside the role names. */
export const DEPARTMENT_LABEL_KEYS = {
  LAB: "departmentLab",
  EKSPLORASI: "departmentEksplorasi",
} as const satisfies Record<Department, string>;
