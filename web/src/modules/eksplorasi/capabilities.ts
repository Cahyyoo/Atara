import type { Persona } from "@/core/lib/auth/permissions";

/** Who may do what in the Eksplorasi module, by persona. Merged in src/modules/capabilities.ts. */
export const EKSPLORASI_CAPABILITIES = {
  /** The drilling data: list, add, edit, remove drill holes. */
  manageDrilling: ["EKSPLORASI_ADMIN"],
} as const satisfies Record<string, readonly Persona[]>;
