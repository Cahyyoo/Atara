/**
 * The sub-path the app is served under, e.g. "/atara" behind a reverse proxy
 * that only forwards `/atara*`. Empty when it owns the whole origin.
 *
 * next.config.ts sets the same value as `basePath`, which covers <Link>, the
 * router and redirect(). It does not cover anything Next does not build: a
 * fetch, a `location.href`, a plain <a>. Those go through withBasePath, or
 * they reach `/api/...` on the proxy, which does not forward it.
 *
 * NEXT_PUBLIC_ so the browser bundle gets it too; like basePath itself it is
 * fixed at `next build`.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");

/** Prefixes a root-relative path ("/api/x") with BASE_PATH; leaves anything else alone. */
export function withBasePath(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith("//")) return path;
  return BASE_PATH + path;
}
