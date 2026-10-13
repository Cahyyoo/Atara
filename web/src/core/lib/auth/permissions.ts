/**
 * Who may do what, in one table.
 *
 * There used to be one question -- "is this an administrator?" -- asked in
 * forty places. Several roles across several departments cannot be expressed
 * as a yes/no, and forty copies of the rule would drift the first time one of
 * them changed. So every check in the app asks for a capability by name, and
 * this file is the only place that says who holds it.
 *
 * Pure, with no server imports: the sidebar asks the same questions in the
 * browser that the routes ask on the server, and the two must agree.
 *
 * Atara is a super app: each department is a module (see modules.ts), and an
 * account is a role *within* a department. The pair is folded into a persona,
 * and the table below is keyed by persona:
 *
 *   SUPER_ADMIN       belongs to no department. Manages the department admins'
 *                     accounts and the system settings: announcements, the
 *                     sign-in audit, the backup. Does not work in any module.
 *   LAB_ADMIN         ADMIN in LAB. Runs the sample-monitoring module: its
 *                     staff, master data, the activity trail, the dashboard's
 *                     settings. Reads the sample database, never edits it; the
 *                     one exception is correcting a sample's stage, always with
 *                     a stated reason.
 *   DATABASE          (LAB) owns the samples: generates barcodes, reprints
 *                     labels, keeps the sample database correct.
 *   ANALISIS          (LAB) enters assay results.
 *   OPERATOR          (LAB) moves samples between stages with the mobile app,
 *                     including the corrections that step back or skip one.
 *   EKSPLORASI_ADMIN  ADMIN in EKSPLORASI. Manages the drilling data.
 */

import { CAPABILITIES } from "@/modules/capabilities";

export const ROLES = ["SUPER_ADMIN", "ADMIN", "DATABASE", "ANALISIS", "OPERATOR"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const DEPARTMENTS = ["LAB", "EKSPLORASI"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export function isDepartment(value: unknown): value is Department {
  return typeof value === "string" && (DEPARTMENTS as readonly string[]).includes(value);
}

/** What every check needs to know about somebody. A session is one. */
export interface Access {
  role: Role;
  department: Department | null;
}

/**
 * Which departments each role may belong to. An empty list means "none":
 * the super admin stands above the departments rather than in one.
 */
const ROLE_DEPARTMENTS = {
  SUPER_ADMIN: [],
  ADMIN: ["LAB", "EKSPLORASI"],
  DATABASE: ["LAB"],
  ANALISIS: ["LAB"],
  OPERATOR: ["LAB"],
} as const satisfies Record<Role, readonly Department[]>;

export function departmentsFor(role: Role): readonly Department[] {
  return ROLE_DEPARTMENTS[role];
}

/** Whether this role in this department is an account that may exist. */
export function isValidAccess(role: Role, department: Department | null): boolean {
  const allowed: readonly Department[] = ROLE_DEPARTMENTS[role];
  return department === null ? allowed.length === 0 : allowed.includes(department);
}

export const PERSONAS = [
  "SUPER_ADMIN",
  "LAB_ADMIN",
  "DATABASE",
  "ANALISIS",
  "OPERATOR",
  "EKSPLORASI_ADMIN",
] as const;
export type Persona = (typeof PERSONAS)[number];

/**
 * The role and department as one name. An account whose pair is not valid
 * (which validation keeps from being written) has no persona, and so holds
 * nothing.
 */
export function personaOf({ role, department }: Access): Persona | null {
  if (!isValidAccess(role, department)) return null;
  if (role === "ADMIN") return department === "EKSPLORASI" ? "EKSPLORASI_ADMIN" : "LAB_ADMIN";
  return role;
}

/**
 * The table itself is assembled from each module's capabilities.ts (see
 * src/modules/capabilities.ts), so a module brings its own rules with it.
 */
export { CAPABILITIES };

export type Capability = keyof typeof CAPABILITIES;

export function can(access: Access, capability: Capability): boolean {
  const persona = personaOf(access);
  return persona !== null && (CAPABILITIES[capability] as readonly Persona[]).includes(persona);
}
