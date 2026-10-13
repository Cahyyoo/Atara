import type { ComponentType } from "react";
import type { IconType } from "react-icons";
import type { Capability, Persona } from "@/core/lib/auth/permissions";

/**
 * The shape of a module's manifest (modules/<key>/module.ts): everything the
 * shared shell needs to know about a module -- its pages in the menu, its
 * part of the guide and its tours -- so the shell never names a module.
 *
 * Pure types: the manifests are plain objects, read in the browser (menu,
 * tours) and on the server (portal, guide) alike.
 */

/** One entry in the module's sidebar. Its page checks the same capability (requireCapabilityPage). */
export interface NavItem {
  href: string;
  /** Message key under `nav`. */
  key: string;
  icon: IconType;
  capability: Capability;
}

/** One section of the guide. Its words are under `help.sections.<key>`. */
export interface HelpSection {
  key: string;
  icon: IconType;
  /** The page it explains, when it explains a page. */
  href?: string;
  /** Who it is for; null is everybody. */
  capability: Capability | null;
}

/** One step of a tour; the words are in `tours.<key>.<n>`. */
export interface TourStep {
  /** The `data-tour` value to highlight; null for a step with no element. */
  target: string | null;
  /** Move on by itself once the person clicks the highlighted element. */
  advanceOnClick?: boolean;
  /** Clicking this saves or changes data: shown with a warning. */
  savesData?: boolean;
  /** May legitimately be missing (no data yet, role, screen size). */
  optional?: boolean;
}

/** A guided tour of one page, keyed like the section of the guide it belongs to. */
export interface Tour {
  key: string;
  path: `/${string}`;
  /**
   * For a page that needs something to exist first (a sample's own page):
   * where to open it, or null when there is nothing to show yet.
   */
  resolvePath?: () => Promise<string | null>;
  steps: TourStep[];
}

export interface AppModule {
  key: string;
  /** Every page of the module lives under this path. */
  basePath: string;
  /** The page its card on the launcher opens (when this person may; else the first menu they may). */
  homePath: string;
  icon: IconType;
  /** Who works in it: the people who see its card on the launcher. */
  personas: readonly Persona[];
  nav: readonly NavItem[];
  helpSections: readonly HelpSection[];
  tours: readonly Tour[];
  /** Pages under this prefix that are explained by a section without a menu entry. */
  helpFallbacks?: readonly { prefix: string; section: string }[];
  /**
   * Pieces the shell renders: in the header while the module is open (a
   * search box), and out of sight for the module's people everywhere (a
   * tracker). Lab-only things stay in the lab.
   */
  shell?: { header?: ComponentType; background?: ComponentType };
}
