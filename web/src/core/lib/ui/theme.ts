/**
 * Light or dark, held in a cookie.
 *
 * A cookie rather than localStorage, and that is the whole design: the server
 * reads it and puts the class on <html> in the first byte it sends, so the
 * page never renders light and then flips. localStorage cannot be read until
 * JavaScript runs, which is exactly one paint too late — the flash of the
 * wrong theme is the thing most implementations get wrong, and this avoids it
 * rather than patching over it with a blocking inline script.
 *
 * It also mirrors how the locale already works here (see i18n/config.ts), so
 * there is one way preferences are stored, not two.
 */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The lab has always been light; dark is opt-in. */
export const DEFAULT_THEME: Theme = "light";
export const THEME_COOKIE = "atara-theme";

export function isTheme(value: string | undefined): value is Theme {
  return value !== undefined && (THEMES as readonly string[]).includes(value);
}
