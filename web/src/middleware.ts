import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/samples",
  "/database",
  "/assay",
  "/master-data",
  "/analytics",
  "/activity",
  "/users",
  "/tv",
  "/grade",
  "/data-quality",
  "/admin",
  "/help",
  "/change-password",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
    "/dashboard/:path*",
    "/samples/:path*",
    "/database/:path*",
    "/assay/:path*",
    "/master-data/:path*",
    "/analytics/:path*",
    "/activity/:path*",
    "/users/:path*",
    "/tv/:path*",
    "/grade/:path*",
    "/data-quality/:path*",
    "/admin/:path*",
    "/help/:path*",
  ],
};
