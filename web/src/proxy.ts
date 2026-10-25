import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionCookieOptions, verifySessionToken } from "@/core/lib/auth/auth";

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
    const response = NextResponse.redirect(loginUrl);
    /**
     * A cookie that is there but no longer a token -- its seven days are up,
     * or it was signed with another secret -- can never be good again. It
     * used to stay, sent with every request and decoded on every page; it is
     * cleared on the way out, with the flags sign-out uses. A cookie whose
     * signature is fine but whose session was ended is the pages' to judge
     * (page-auth.ts reads the database); this file never does.
     */
    if (token) {
      response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0, request));
    }
    return response;
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
