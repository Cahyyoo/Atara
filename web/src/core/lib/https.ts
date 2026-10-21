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

/**
 * Whether the session cookie should carry `Secure` for this request.
 *
 * APP_HTTPS still decides when it is set. Unset, the request itself decides,
 * rather than NODE_ENV: a production build on a plain-HTTP box with the flag
 * left empty -- the default in .env.example -- used to mark the cookie Secure,
 * the browser dropped it, and every sign-in "succeeded" and landed straight
 * back on /login. A Secure cookie is only worth anything where it can be sent.
 *
 * `x-forwarded-proto` is read only behind a proxy the deployment vouches for
 * (TRUST_PROXY=1, as for the client address), since a client can set it itself.
 */
export function isSecureRequest(request: { headers: Headers; nextUrl?: { protocol: string }; url: string }): boolean {
  const flag = process.env.APP_HTTPS?.trim();
  if (flag) return flag === "1";

  if (process.env.TRUST_PROXY === "1") {
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (forwarded) return forwarded === "https";
  }
  const protocol = request.nextUrl?.protocol ?? new URL(request.url).protocol;
  return protocol === "https:";
}
