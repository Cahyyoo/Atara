import { LAB_CAPABILITIES } from "@/modules/lab/capabilities";
import { EKSPLORASI_CAPABILITIES } from "@/modules/eksplorasi/capabilities";
import { SYSTEM_CAPABILITIES } from "@/modules/system/capabilities";

/**
 * Every module's capability table, merged: the one list permissions.ts
 * checks against. Pure and free of icons or components, so a route that only
 * asks `can()` pulls in nothing else.
 *
 * A new module adds its capabilities.ts here.
 */
export const MODULE_CAPABILITIES = {
  lab: LAB_CAPABILITIES,
  eksplorasi: EKSPLORASI_CAPABILITIES,
  system: SYSTEM_CAPABILITIES,
} as const;

export const CAPABILITIES = {
  ...LAB_CAPABILITIES,
  ...EKSPLORASI_CAPABILITIES,
  ...SYSTEM_CAPABILITIES,
} as const;
