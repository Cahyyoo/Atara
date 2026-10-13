import type { Locale } from "@/core/i18n/config";
import type { MessageTree } from "@/core/i18n/merge";
import labId from "@/modules/lab/messages/id.json";
import labEn from "@/modules/lab/messages/en.json";
import eksplorasiId from "@/modules/eksplorasi/messages/id.json";
import eksplorasiEn from "@/modules/eksplorasi/messages/en.json";
import systemId from "@/modules/system/messages/id.json";
import systemEn from "@/modules/system/messages/en.json";
import type { ModuleKey } from "@/modules/registry";

/**
 * Every module's message catalogue, per locale. Read on the server only: the
 * browser gets just the catalogues of the modules its person works in (see
 * core/i18n/catalogue.ts). A new module adds its two files here.
 */
/** The shape of every module's catalogue together, so tests can read deep keys typed. */
export type ModuleCatalogue = typeof labEn & typeof eksplorasiEn & typeof systemEn;

export const MODULE_MESSAGES: Record<ModuleKey, Record<Locale, MessageTree>> = {
  lab: { id: labId, en: labEn },
  eksplorasi: { id: eksplorasiId, en: eksplorasiEn },
  system: { id: systemId, en: systemEn },
};
