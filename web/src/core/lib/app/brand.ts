/**
 * The product name, in one place.
 *
 * It has been renamed twice already, and each time it had to be chased through
 * the layout metadata, the sidebar and the sign-in page. Reading it from here
 * means the next rename touches this line and the platform identifiers, rather
 * than every surface that happens to display it.
 */
export const APP_NAME = "Atara";

/**
 * The company logo, for the exported spreadsheets only -- the app itself keeps
 * its own mark. A path under public/, read from disk by xlsx-brand.ts.
 */
export const BRAND_LOGO_SRC = "/img/logo_aspire.png";
