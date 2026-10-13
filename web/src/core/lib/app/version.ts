/**
 * The release this build came from.
 *
 * Set from package.json in next.config.ts, so the number on screen is the one
 * that was built rather than a second copy kept in step by hand. A dev server
 * started some other way has no value for it, and says so instead of printing
 * a version it cannot vouch for.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
