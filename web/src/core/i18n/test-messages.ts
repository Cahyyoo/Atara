import { allMessages } from "@/core/i18n/catalogue";
import coreEn from "@/core/messages/en.json";
import type { ModuleCatalogue } from "@/modules/messages";

/**
 * Every message catalogue merged, for tests: one import that does not depend
 * on how deep the test file sits or which module a string lives in. Typed as
 * the union of the catalogues so `messages.help.sections` still type-checks.
 */
type Catalogue = typeof coreEn & ModuleCatalogue;

export const en = allMessages("en") as unknown as Catalogue;
export const id = allMessages("id") as unknown as Catalogue;
