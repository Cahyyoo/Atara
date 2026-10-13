import type { Locale } from "@/core/i18n/config";
import { mergeMessages, type MessageTree } from "@/core/i18n/merge";
import { can, type Access, type Capability } from "@/core/lib/auth/permissions";
import { MODULE_CAPABILITIES } from "@/modules/capabilities";
import { MODULE_MESSAGES } from "@/modules/messages";
import type { ModuleKey } from "@/modules/registry";
import coreId from "@/core/messages/id.json";
import coreEn from "@/core/messages/en.json";

/**
 * The message catalogues, assembled.
 *
 * The server translates with all of them. The browser is sent only the
 * shared catalogue plus the modules its person works in: an exploration
 * admin's pages no longer carry the lab's 40 KB of words, and nobody's carry
 * another department's.
 */
const CORE: Record<Locale, MessageTree> = { id: coreId, en: coreEn };
const MODULE_KEYS = Object.keys(MODULE_MESSAGES) as ModuleKey[];

const cache = new Map<string, MessageTree>();
function cached(key: string, build: () => MessageTree): MessageTree {
  let value = cache.get(key);
  if (!value) {
    value = build();
    cache.set(key, value);
  }
  return value;
}

/** Everything, for the server's own rendering. */
export function allMessages(locale: Locale): MessageTree {
  return messagesFor(locale, MODULE_KEYS);
}

/** The shared catalogue only: sign-in, password change, errors. */
export function coreMessages(locale: Locale): MessageTree {
  return CORE[locale];
}

/** The shared catalogue with these modules' merged in. */
export function messagesFor(locale: Locale, modules: readonly ModuleKey[]): MessageTree {
  const keys = [...modules].sort();
  return cached(`${locale}:${keys.join(",")}`, () =>
    mergeMessages(CORE[locale], ...keys.map((key) => MODULE_MESSAGES[key][locale]))
  );
}

/**
 * The modules whose words somebody's pages may need: every module they hold
 * at least one capability of. A lab admin gets the system module too, for the
 * Users page they share with the super admin.
 */
export function moduleKeysFor(access: Access): ModuleKey[] {
  return MODULE_KEYS.filter((key) =>
    (Object.keys(MODULE_CAPABILITIES[key]) as Capability[]).some((capability) => can(access, capability))
  );
}
