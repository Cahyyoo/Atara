import { can, personaOf, type Access } from "@/core/lib/auth/permissions";
import type { AppModule, NavItem } from "@/core/lib/app/module-types";
import { MODULES, type ModuleKey } from "@/modules/registry";

export { HOME_PATH } from "@/core/lib/app/home-path";
export type { ModuleKey };

/**
 * Which modules somebody may open: those that list their persona. The
 * launcher (/home) shows a card for each, so it never offers a door the pages
 * behind it would then refuse.
 *
 * Pure: the shell asks these in the browser, the launcher on the server.
 */
export function canAccessModule(access: Access, key: ModuleKey): boolean {
  const persona = personaOf(access);
  const appModule: AppModule | undefined = MODULES.find((m) => m.key === key);
  return persona !== null && appModule !== undefined && appModule.personas.includes(persona);
}

export function modulesFor(access: Access): readonly AppModule[] {
  return MODULES.filter((m) => canAccessModule(access, m.key));
}

/** Matches the section, not any path that merely starts with the same letters. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The module a page belongs to: the one with the longest path that holds it,
 * counting its base path and every page in its menu (/users is the settings
 * module's, though it is not under /admin). Null for the pages of no module
 * -- the launcher and the guide -- which the shell shows without a sidebar.
 */
export function moduleForPath(pathname: string): AppModule | null {
  let best: { module: AppModule; length: number } | null = null;
  for (const appModule of MODULES) {
    for (const path of [appModule.basePath, ...appModule.nav.map((item) => item.href)]) {
      if (isActivePath(pathname, path) && (best === null || path.length > best.length)) {
        best = { module: appModule, length: path.length };
      }
    }
  }
  return best?.module ?? null;
}

/** The menu items of a module that this person may open. */
export function navFor(access: Access, appModule: AppModule): readonly NavItem[] {
  return appModule.nav.filter((item) => can(access, item.capability));
}

/**
 * The menu item a page is: the most specific match, so /admin/sign-ins is not
 * also /admin. Null for a page with no menu entry (a sample's own page). The
 * sidebar marks it; the breadcrumb ends on it.
 */
export function activeNavItem<T extends { href: string }>(pathname: string, items: readonly T[]): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (isActivePath(pathname, item.href) && (best === null || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/**
 * Where a module's card on the launcher goes: its home page when this person
 * may open it, otherwise the first page of its menu they may (the lab admin's
 * settings are only Users, not the super admin's /admin).
 */
export function moduleEntryPath(access: Access, appModule: AppModule): string {
  const items = navFor(access, appModule);
  const home = appModule.nav.find((item) => item.href === appModule.homePath);
  if (home === undefined || can(access, home.capability)) return appModule.homePath;
  return items[0]?.href ?? appModule.homePath;
}
