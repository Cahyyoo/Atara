import type { Persona } from "@/core/lib/auth/permissions";

export const EKSPLORASI_CAPABILITIES = {
  /** The assay data source and its QC lists: view the dashboard, list, add, edit, remove, import, export. */
  manageExplorationData: ["EKSPLORASI_ADMIN"],
} as const satisfies Record<string, readonly Persona[]>;
