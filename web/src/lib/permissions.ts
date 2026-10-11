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

/** The lab's people: everybody who works in the sample-monitoring module. */
export const LAB_PERSONAS = ["LAB_ADMIN", "DATABASE", "ANALISIS", "OPERATOR"] as const;
export type LabPersona = (typeof LAB_PERSONAS)[number];

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

const LAB = LAB_PERSONAS;

export const CAPABILITIES = {
  // --- Lab: sample monitoring --------------------------------------------

  /** The lab dashboard's figures and charts, and the wall monitor. */
  viewDashboard: LAB,
  /** The dashboard's stage SLA settings and its samples export. */
  manageDashboard: ["LAB_ADMIN"],

  /** The Sample Database page. */
  viewDatabase: ["LAB_ADMIN", "DATABASE"],
  /** Its export, the deleted-records view, and a record's change history. */
  exportDatabase: ["LAB_ADMIN", "DATABASE"],
  viewDeletedRecords: ["LAB_ADMIN", "DATABASE"],
  viewRecordHistory: ["LAB_ADMIN", "DATABASE", "ANALISIS"],
  /** Editing a record, and removing or restoring samples. Admin reads only. */
  editDatabase: ["DATABASE"],

  /** Generate Barcode and Reprint Labels, and the print button on a sample. */
  generateSamples: ["DATABASE"],
  printLabels: ["DATABASE"],

  /** Enter Results: the grid, the paste and the workbook import. */
  enterResults: ["ANALISIS"],
  /** Lab records as data, for every page that lists them. */
  readLabRecords: ["LAB_ADMIN", "DATABASE", "ANALISIS"],

  /** Who moved which sample, and when. */
  viewActivity: ["LAB_ADMIN"],
  manageMasterData: ["LAB_ADMIN"],

  /** Scanning a sample into its next stage, from the mobile app. */
  scanSamples: ["OPERATOR"],
  /** Moving a sample back, or past a stage, with a stated reason. */
  overrideStage: ["OPERATOR"],
  /**
   * The same correction from a sample's page on the website, for when the
   * phone in the lab was the thing that got it wrong.
   */
  correctStage: ["LAB_ADMIN"],

  // --- Eksplorasi ---------------------------------------------------------

  /** The drilling data: list, add, edit, remove drill holes. */
  manageDrilling: ["EKSPLORASI_ADMIN"],

  // --- Accounts and the system -------------------------------------------

  /**
   * The Users page. Which accounts each holder may touch is narrower than
   * this and lives in user-scope.ts: the super admin manages the department
   * admins, a department admin manages its own staff.
   */
  manageUsers: ["SUPER_ADMIN", "LAB_ADMIN"],
  /** Banners above every page, for everybody or for some roles. */
  manageAnnouncements: ["SUPER_ADMIN"],
  /** Who signed in, from where, and who was refused. */
  viewSignInAudit: ["SUPER_ADMIN"],
  /** The whole database as one workbook, for safekeeping. */
  exportBackup: ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly Persona[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(access: Access, capability: Capability): boolean {
  const persona = personaOf(access);
  return persona !== null && (CAPABILITIES[capability] as readonly Persona[]).includes(persona);
}

export function isLabPersona(persona: Persona | null): persona is LabPersona {
  return persona !== null && (LAB_PERSONAS as readonly string[]).includes(persona);
}
