import type { Persona } from "@/core/lib/auth/permissions";

/**
 * Who may do what in the Lab module (sample monitoring), by persona.
 *
 * Merged with every other module's table in src/modules/capabilities.ts;
 * permissions.ts (`can`) is the only thing that reads the result.
 */

/** The lab's people: everybody who works in the sample-monitoring module. */
export const LAB_PERSONAS = ["LAB_ADMIN", "DATABASE", "ANALISIS", "OPERATOR"] as const;
export type LabPersona = (typeof LAB_PERSONAS)[number];

export function isLabPersona(persona: Persona | null): persona is LabPersona {
  return persona !== null && (LAB_PERSONAS as readonly string[]).includes(persona);
}

const LAB = LAB_PERSONAS;

export const LAB_CAPABILITIES = {
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
} as const satisfies Record<string, readonly Persona[]>;
