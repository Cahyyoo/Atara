import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { escapeCsvField } from "@/core/lib/sheets/csv";
import { isSecureRequest } from "@/core/lib/https";
import { isCrossOriginWrite } from "@/core/lib/http/same-origin";
import { readCappedForm } from "@/core/lib/http/upload";

/**
 * The fixes behind "the sign-in worked, then I was back on /login", and the
 * basic hardening that came with them.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the session cookie's Secure flag", () => {
  const request = (url: string, headers: Record<string, string> = {}) =>
    new NextRequest(url, { headers });

  it("follows APP_HTTPS when it is set", () => {
    vi.stubEnv("APP_HTTPS", "1");
    expect(isSecureRequest(request("http://192.168.1.10/atara/api/auth/login"))).toBe(true);
    vi.stubEnv("APP_HTTPS", "0");
    expect(isSecureRequest(request("https://lab.example/api/auth/login"))).toBe(false);
  });

  /**
   * The bounce: a production build on a plain-HTTP box with APP_HTTPS left
   * empty marked the cookie Secure, and the browser dropped it.
   */
  it("follows the request when APP_HTTPS is empty, even in production", () => {
    vi.stubEnv("APP_HTTPS", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isSecureRequest(request("http://192.168.1.10/atara/api/auth/login"))).toBe(false);
    expect(isSecureRequest(request("https://lab.example/api/auth/login"))).toBe(true);
  });

  it("reads x-forwarded-proto only behind a proxy the deployment vouches for", () => {
    vi.stubEnv("APP_HTTPS", "");
    const proxied = () =>
      request("http://127.0.0.1:3010/api/auth/login", { "x-forwarded-proto": "https" });
    vi.stubEnv("TRUST_PROXY", "0");
    expect(isSecureRequest(proxied())).toBe(false);
    vi.stubEnv("TRUST_PROXY", "1");
    expect(isSecureRequest(proxied())).toBe(true);
  });
});

describe("writes from another origin", () => {
  const post = (headers: Record<string, string>, method = "POST") =>
    ({ method, headers: new Headers(headers) });

  it("lets the app's own pages through", () => {
    expect(isCrossOriginWrite(post({ host: "192.168.1.10:3010", origin: "http://192.168.1.10:3010" }))).toBe(false);
  });

  /** Same site (same host), other port: SameSite=lax sends the cookie anyway. */
  it("refuses another app on the same server", () => {
    expect(isCrossOriginWrite(post({ host: "192.168.1.10:3010", origin: "http://192.168.1.10:8080" }))).toBe(true);
    expect(isCrossOriginWrite(post({ host: "lab.example", origin: "null" }))).toBe(true);
  });

  it("takes the forwarded host behind a proxy that rewrites Host", () => {
    expect(
      isCrossOriginWrite(
        post({ host: "127.0.0.1:3010", "x-forwarded-host": "lab.example", origin: "https://lab.example" })
      )
    ).toBe(false);
  });

  it("leaves reads, Bearer callers and requests without an Origin alone", () => {
    expect(isCrossOriginWrite(post({ host: "a", origin: "http://b" }, "GET"))).toBe(false);
    expect(isCrossOriginWrite(post({ host: "a", origin: "http://b", authorization: "Bearer x" }))).toBe(false);
    expect(isCrossOriginWrite(post({ host: "a" }))).toBe(false);
  });

  it("is checked for every signed-in route, and for signing out", () => {
    expect(read("core", "lib", "http", "api-auth.ts")).toContain("isCrossOriginWrite(request)");
    expect(read("app", "api", "(core)", "auth", "logout", "route.ts")).toContain("isCrossOriginWrite(request)");
  });
});

describe("one tab cannot sign out another tab's newer session", () => {
  it("names the session to end, from every place that signs out", () => {
    expect(read("core", "components", "layout", "user-menu.tsx")).toContain("signOutSession(user.sessionId)");
    expect(read("core", "components", "auth", "force-password-form.tsx")).toContain("signOutSession(sessionId)");
    const watch = read("core", "components", "layout", "session-watch.tsx");
    expect(watch).toContain("signOutSession(sessionId)");
    expect(watch).not.toContain('fetch(withBasePath("/api/auth/logout")');
  });

  it("leaves a session it was not asked about, and its cookie, alone", () => {
    const logout = read("app", "api", "(core)", "auth", "logout", "route.ts");
    expect(logout).toContain("expected !== session.sessionId");
    expect(logout).toContain("stale: true");
  });

  it("ends the previous account's session when another signs in on the same browser", () => {
    const issue = read("core", "lib", "auth", "session-response.ts");
    expect(issue).toContain("previous.userId !== user.id");
    expect(issue).toContain("endSession(previous.sessionId, previous.userId)");
  });

  it("does not leave a session that ended with nothing to say unnoticed", () => {
    expect(read("core", "components", "layout", "session-watch.tsx")).toContain("/login?next=");
  });
});

describe("CSV exports", () => {
  it("keeps a typed formula from running in Excel", () => {
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvField("+cmd")).toBe("'+cmd");
    expect(escapeCsvField('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(escapeCsvField("\t=1")).toBe("'\t=1");
  });

  it("leaves numbers, dashes and ordinary text as they are", () => {
    expect(escapeCsvField("-1.25")).toBe("-1.25");
    expect(escapeCsvField("+5")).toBe("+5");
    expect(escapeCsvField("-")).toBe("-");
    expect(escapeCsvField("2026-10-21")).toBe("2026-10-21");
    expect(escapeCsvField("PIT A, Blok 2")).toBe('"PIT A, Blok 2"');
  });
});

describe("uploads", () => {
  /** A body with no Content-Length (chunked) used to be buffered whole. */
  it("stops a form at the cap while it streams in, whatever the headers say", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(200 * 1024)], "big.xlsx"));
    const sized = new Request("http://localhost/upload", { method: "POST", body: form });
    const body = await sized.arrayBuffer();
    const headers = new Headers(sized.headers);
    headers.delete("content-length");

    const chunked = new Request("http://localhost/upload", {
      method: "POST",
      headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(body));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

    const tooLarge = new Error("too large");
    await expect(readCappedForm(chunked, 16 * 1024, () => tooLarge)).rejects.toBe(tooLarge);
  });

  it("still reads a form inside the cap", async () => {
    const form = new FormData();
    form.set("file", new File(["a,b\n1,2\n"], "small.csv"));
    const request = new Request("http://localhost/upload", { method: "POST", body: form });
    const read = await readCappedForm(request, 1024 * 1024, () => new Error("too large"));
    expect(read?.get("file")).toBeInstanceOf(File);
  });
});

describe("results entry", () => {
  it("refuses identity columns to a role that may only enter results", () => {
    const bulk = read("app", "api", "(lab)", "lab-records", "bulk", "route.ts");
    expect(bulk).toContain('!can(session, "editSampleIdentity") && planned.some((entry) => touchesIdentity(entry.values))');
  });
});

describe("the sign-in page and the browser's history", () => {
  /** Typing /login into a signed-in browser used to show the form. */
  it("sends somebody already signed in on, by their live session", () => {
    const page = read("app", "login", "page.tsx");
    expect(page).toContain("await getActiveSession()");
    expect(page).toContain("redirect(safeRedirectPath(");
    expect(page).toContain('redirect("/change-password")');
    // The signature alone would loop an ended session between /home and here.
    expect(page).not.toContain("getSessionFromCookies");
  });

  it("replaces the page rather than pushing, after signing in and after signing out", () => {
    expect(read("core", "components", "auth", "login-form.tsx")).toContain("router.replace(mustChangePassword");
    expect(read("core", "components", "layout", "user-menu.tsx")).toContain('router.replace("/login")');
    expect(read("core", "components", "auth", "force-password-form.tsx")).toContain('router.replace("/login")');
    expect(read("core", "components", "auth", "force-password-form.tsx")).not.toContain('router.push("/login")');
  });

  it("watches the session on the change-password page too", () => {
    expect(read("app", "change-password", "page.tsx")).toContain("<SessionWatch sessionId={session.sessionId} />");
  });
});

describe("a cookie that is no longer a token", () => {
  it("is cleared on the way to the sign-in page", async () => {
    vi.stubEnv("JWT_SECRET", "x".repeat(48));
    const { proxy } = await import("@/proxy");
    const response = await proxy(
      new NextRequest("http://localhost/home", { headers: { cookie: "atara_session=not-a-token" } })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?next=%2Fhome");
    const cleared = response.headers.get("set-cookie") ?? "";
    expect(cleared).toMatch(/atara_session=;/);
    expect(cleared).toMatch(/Max-Age=0/);
  });

  it("is left alone when there is no cookie to clear", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(new NextRequest("http://localhost/home"));
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
