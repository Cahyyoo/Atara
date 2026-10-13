import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/core/lib/auth/auth";

/**
 * The first, cheap check: a page of the app with no valid session token goes
 * to the sign-in page, remembering where it was headed.
 *
 * Only the token's signature is checked here. Whether the session is still
 * live, and whether this person's role and department may open the page, is
 * decided by the page itself (page-auth.ts), which reads the database.
 *
 * Next 16 calls this file `proxy.ts` (it was `middleware.ts`).
 */
const PROTECTED_PREFIXES = [
  "/home",
  "/lab",
  "/eksplorasi",
  "/users",
  "/admin",
  "/help",
  "/change-password",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    // Cloned from nextUrl, not built with new URL("/login", request.url):
    // nextUrl carries the basePath (e.g. /atara) and the latter drops it.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home/:path*",
    "/lab/:path*",
    "/eksplorasi/:path*",
    "/users/:path*",
    "/admin/:path*",
    "/help/:path*",
    "/change-password",
  ],
};
