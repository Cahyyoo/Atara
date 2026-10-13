/**
 * Whether the module sidebar is narrowed to its icons, held in a cookie for
 * the reason the theme is (see theme.ts): the server renders the right width
 * in the first byte, so the page never lays out wide and then snaps narrow.
 *
 * Written from the browser rather than by a server action: the server only
 * needs it on the next render, and an action that sets a cookie refreshes the
 * whole page for a click that should cost nothing.
 */
export const SIDEBAR_COOKIE = "atara-sidebar";
const COLLAPSED = "collapsed";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function isSidebarCollapsed(value: string | undefined): boolean {
  return value === COLLAPSED;
}

/** Browser only. */
export function rememberSidebarCollapsed(collapsed: boolean): void {
  document.cookie = collapsed
    ? `${SIDEBAR_COOKIE}=${COLLAPSED}; path=/; max-age=${ONE_YEAR}; samesite=lax`
    : `${SIDEBAR_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
