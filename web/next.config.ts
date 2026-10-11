import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { version } from "./package.json";

const withNextIntl = createNextIntlPlugin();

const isProduction = process.env.NODE_ENV === "production";

/**
 * Whether the site is served over HTTPS -- the same rule as isHttpsDeployment
 * in src/lib/https.ts, repeated because this file cannot import from `@/`.
 * Headers are fixed at `next build`, so APP_HTTPS must be set before building.
 */
const appHttps = process.env.APP_HTTPS?.trim();
const useHttps = appHttps ? appHttps === "1" : isProduction;

/**
 * The sub-path behind a proxy, e.g. "/atara" -- the same value BASE_PATH in
 * src/lib/base-path.ts reads for the fetches basePath does not cover.
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");

/**
 * `script-src` deliberately allows inline script: Next.js injects its bootstrap
 * and RSC payload inline, and locking that down needs a per-request nonce, which
 * in turn forces every page to render dynamically. The directives that do not
 * depend on that are set as tightly as the app allows, so clickjacking, form
 * hijacking, `<base>` injection and plugin embedding are all closed off.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (isProduction ? "" : " 'unsafe-eval'"),
  // Tailwind and the UI kit set style attributes at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The app only ever talks to its own API.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Over plain HTTP this would rewrite every asset URL to https:// and break the page.
  ...(useHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt and braces alongside frame-ancestors, for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /**
   * `camera=(self)` and not `camera=()`.
   *
   * An empty allowlist disables the feature for every origin including this
   * one, and the browser then refuses getUserMedia at the policy level --
   * without ever showing the permission prompt. That is what it did: the
   * enrolment dialog reported "access was refused" for a refusal nobody had
   * been asked to make.
   *
   * This line used to read "the web build needs none of these", which was
   * true until face enrolment arrived and was not updated with it. The other
   * three stay shut, because nothing here uses them.
   */
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  /**
   * Asks Chromium browsers for the few details their user agent no longer
   * carries: which Windows (10 and 11 send the same string), which phone
   * model, and the browser's own version. Sent on the next request -- the
   * sign-in -- and used only to tell the device a sign-in signs out what took
   * its place (deviceInfoFrom in session-client.ts). Browsers only send them
   * over HTTPS or on localhost; elsewhere the user agent is all there is.
   */
  {
    key: "Accept-CH",
    value: "Sec-CH-UA-Platform-Version, Sec-CH-UA-Model, Sec-CH-UA-Full-Version-List",
  },
];

const nextConfig: NextConfig = {
  basePath: basePath || undefined,

  // The default bottom-left overlay covers the sidebar's Log Out button.
  devIndicators: { position: "bottom-right" },

  // The release the footer prints, read from package.json at build time so
  // the number on screen is the one that was built, never a second copy
  // somebody has to remember to bump.
  env: { NEXT_PUBLIC_APP_VERSION: version },

  // Announcing the framework and its version only helps someone matching
  // a known advisory against this deployment.
  poweredByHeader: false,

  // Nothing here uses next/image, but the optimiser's /_next/image endpoint
  // is served regardless and has carried remote-code-execution advisories
  // (GHSA-2xp9-vwfh-vxw4, via AVIF). An endpoint the app does not need is
  // attack surface with no upside.
  images: { unoptimized: true },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: useHttps
          ? [
              ...SECURITY_HEADERS,
              // Only meaningful over HTTPS, and harmful to send over plain HTTP.
              {
                key: "Strict-Transport-Security",
                value: "max-age=63072000; includeSubDomains; preload",
              },
            ]
          : SECURITY_HEADERS,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
