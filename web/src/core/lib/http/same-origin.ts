/**
 * Refuses a cookie-carried request that changes something when a page on
 * another origin sent it.
 *
 * SameSite=lax keeps the session cookie off requests from other *sites*, but
 * a site is only the host: another app on this same server at another port --
 * http://192.168.1.10:8080 beside this one at :3010 -- is the same site, gets
 * the cookie attached, and could post to any route here as whoever is signed
 * in. The browser says where a request came from in `Origin`, which a page
 * cannot forge, so that is compared with the host the request was sent to.
 *
 * Deliberately narrow, so it cannot lock anybody out:
 *   - reads (GET, HEAD) pass: they change nothing;
 *   - a Bearer token passes: the phone and scripts carry it themselves, and a
 *     page on another origin cannot read it to send it;
 *   - no `Origin` passes: browsers send it on every cross-origin request that
 *     changes something, so its absence means a same-origin form or a client
 *     that is not a browser at all.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossOriginWrite(request: { method: string; headers: Headers }): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  if (request.headers.get("authorization")?.startsWith("Bearer ")) return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    // "null" (a sandboxed frame, a file:// page) does not parse, and is
    // refused with everything else that does not match.
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return true;
  }

  // Behind a proxy that rewrites Host, the host the browser asked for is the
  // forwarded one. Safe to take without TRUST_PROXY, unlike x-forwarded-for:
  // a page on another origin cannot add the header without a CORS preflight,
  // which this app never answers. Next.js checks server actions the same way.
  const hosts = [
    request.headers.get("x-forwarded-host")?.split(",")[0],
    request.headers.get("host"),
  ].flatMap((value) => (value?.trim() ? [value.trim().toLowerCase()] : []));

  return !hosts.includes(originHost);
}
