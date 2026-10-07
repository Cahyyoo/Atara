/**
 * Who may do what, in one table.
 *
 * There used to be one question -- "is this an administrator?" -- asked in
 * forty places. Four roles cannot be expressed as a yes/no, and forty copies
 * of a four-way rule would drift the first time one of them changed. So every
 * check in the app asks for a capability by name, and this file is the only
 * place that says which roles hold it.
 *
 * Pure, with no server imports: the sidebar asks the same questions in the
 * browser that the routes ask on the server, and the two must agree.
 *
 *   ADMIN     runs the system: users, master data, the activity trail, the
 *             dashboard's settings. Reads the sample database, never edits it;
 *             the one exception is correcting a sample's stage from the web,
 *             always with a stated reason.
 *   DATABASE  owns the samples: generates barcodes, reprints labels, keeps the
 *             sample database correct.
 *   ANALISIS  enters assay results.
 *   OPERATOR  moves samples between stages with the mobile app, including the
 *             corrections that step back or skip a stage.
 */

export const ROLES = ["ADMIN", "DATABASE", "ANALISIS", "OPERATOR"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

const EVERYONE = ROLES;

export const CAPABILITIES = {
  /** The dashboard's figures and charts. */
  viewDashboard: EVERYONE,
  /** The dashboard's stage SLA settings and its samples export. */
  manageDashboard: ["ADMIN"],

  /** The Sample Database page. */
  viewDatabase: ["ADMIN", "DATABASE"],
  /** Its export, the deleted-records view, and a record's change history. */
  exportDatabase: ["ADMIN", "DATABASE"],
  viewDeletedRecords: ["ADMIN", "DATABASE"],
  viewRecordHistory: ["ADMIN", "DATABASE", "ANALISIS"],
  /** Editing a record, and removing or restoring samples. Admin reads only. */
  editDatabase: ["DATABASE"],

  /** Generate Barcode and Reprint Labels, and the print button on a sample. */
  generateSamples: ["DATABASE"],
  printLabels: ["DATABASE"],

  /** Enter Results: the grid, the paste and the workbook import. */
  enterResults: ["ANALISIS"],
  /** Lab records as data, for every page that lists them. */
  readLabRecords: ["ADMIN", "DATABASE", "ANALISIS"],

  viewActivity: ["ADMIN"],
  manageUsers: ["ADMIN"],
  manageMasterData: ["ADMIN"],
  /** Banners above every page, for everybody or for some roles. */
  manageAnnouncements: ["ADMIN"],
  /** The whole database as one workbook, for safekeeping. */
  exportBackup: ["ADMIN"],

  /** Scanning a sample into its next stage, from the mobile app. */
  scanSamples: ["OPERATOR"],
  /** Moving a sample back, or past a stage, with a stated reason. */
  overrideStage: ["OPERATOR"],
  /**
   * The same correction from a sample's page on the website, for when the
   * phone in the lab was the thing that got it wrong.
   */
  correctStage: ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}
