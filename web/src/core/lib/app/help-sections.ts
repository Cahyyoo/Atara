import { IoPersonCircleOutline } from "react-icons/io5";
import { can, type Capability, type Access } from "@/core/lib/auth/permissions";
import type { HelpSection } from "@/core/lib/app/module-types";
import { MODULES } from "@/modules/registry";

/**
 * The guide's sections: every module's (from its manifest), then the ones
 * that belong to nobody in particular. Each is tied to the capability of the
 * page it explains, so a role is only taught what it can open. The words are
 * in the message catalogues under `help.sections.<key>`.
 */
const CORE_HELP_SECTIONS: readonly HelpSection[] = [
  { key: "account", icon: IoPersonCircleOutline, capability: null },
];

export const HELP_SECTIONS: readonly HelpSection[] = [
  ...MODULES.flatMap((m) => m.helpSections),
  ...CORE_HELP_SECTIONS,
];

export type HelpSectionKey = string;

/** Whether a section -- and the tour of the same name -- is for this person. */
export function holdsSection(access: Access, capability: Capability | null): boolean {
  return capability === null || can(access, capability);
}

export function helpSectionsFor(access: Access): HelpSection[] {
  return HELP_SECTIONS.filter((section) => holdsSection(access, section.capability));
}

const FALLBACKS = MODULES.flatMap((m) => ("helpFallbacks" in m ? m.helpFallbacks : []));

/**
 * The section that explains the page at `pathname`, for the "?" button: the
 * longest matching menu path, a page a module explains without a menu entry
 * (a sample's own page), or the top of the guide.
 */
export function helpSectionForPath(pathname: string): HelpSectionKey | null {
  let best: { key: HelpSectionKey; length: number } | null = null;
  for (const section of HELP_SECTIONS) {
    const href = section.href;
    if (!href) continue;
    if ((pathname === href || pathname.startsWith(`${href}/`)) && href.length > (best?.length ?? 0)) {
      best = { key: section.key, length: href.length };
    }
  }
  if (best) return best.key;
  return FALLBACKS.find((fallback) => pathname.startsWith(fallback.prefix))?.section ?? null;
}
