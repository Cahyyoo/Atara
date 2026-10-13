import type { Capability, Access } from "@/core/lib/auth/permissions";
import { HELP_SECTIONS, holdsSection, type HelpSectionKey } from "@/core/lib/app/help-sections";
import type { Tour, TourStep } from "@/core/lib/app/module-types";
import { MODULES } from "@/modules/registry";

/**
 * The guided tours: every module's (from its manifest) and the account tour,
 * which is everybody's. For each part of the guide that has a page, the
 * elements to walk through on that page, in order. Each step points at an
 * element by its `data-tour` attribute; the words are in `tours.<key>.<n>`.
 *
 * The tour only points. It never clicks anything for the person, and a step
 * whose element would save something says so (`savesData`).
 */
export type { Tour, TourStep };

const CORE_TOURS: readonly Tour[] = [
  {
    key: "account",
    path: "/home",
    // The launcher's cards: optional, since an account with no module has none.
    steps: [{ target: "user-menu" }, { target: "module-launcher", optional: true }],
  },
];

export const TOURS: readonly Tour[] = [...MODULES.flatMap((m) => m.tours), ...CORE_TOURS];

const CAPABILITY = Object.fromEntries(
  HELP_SECTIONS.map((section) => [section.key, section.capability])
) as Record<HelpSectionKey, Capability | null>;

/** The capability a tour needs: the same as its section of the guide. */
export function tourCapability(key: HelpSectionKey): Capability | null {
  return CAPABILITY[key];
}

export function tourFor(key: string | null | undefined): Tour | null {
  return TOURS.find((tour) => tour.key === key) ?? null;
}

export function toursFor(access: Access): readonly Tour[] {
  return TOURS.filter((tour) => holdsSection(access, tourCapability(tour.key)));
}

/** The URL parameters a running tour lives in. */
export const TOUR_PARAM = "tour";
export const TOUR_STEP_PARAM = "step";

/** Where to send somebody to start a tour on a known page. */
export function tourHref(tour: Tour, path: string = tour.path): string {
  return `${path}?${TOUR_PARAM}=${tour.key}`;
}
