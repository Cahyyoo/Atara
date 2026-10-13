/**
 * Whether this deployment is served over HTTPS.
 *
 * APP_HTTPS="1" or "0" says so outright; unset, a production build is assumed
 * to sit behind HTTPS, which is what it did before the flag existed. It has to
 * be said outright for a plain-HTTP server: a `Secure` cookie sent over HTTP is
 * dropped by the browser, so every sign-in would "succeed" and then bounce
 * straight back to /login.
 *
 * next.config.ts repeats this rule inline for HSTS and the CSP, because the
 * config cannot import from `@/`.
 */
export function isHttpsDeployment(): boolean {
  const flag = process.env.APP_HTTPS?.trim();
  if (flag) return flag === "1";
  return process.env.NODE_ENV === "production";
}
