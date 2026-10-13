import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadWith(basePath: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", basePath as string);
  return import("@/core/lib/http/base-path");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withBasePath", () => {
  it("leaves paths alone when no base path is set", async () => {
    const { withBasePath, BASE_PATH } = await loadWith("");
    expect(BASE_PATH).toBe("");
    expect(withBasePath("/api/auth/login")).toBe("/api/auth/login");
  });

  it("prefixes root-relative paths, trimming a trailing slash off the setting", async () => {
    const { withBasePath } = await loadWith("/atara/");
    expect(withBasePath("/api/auth/login")).toBe("/atara/api/auth/login");
    expect(withBasePath("/login?next=/tv")).toBe("/atara/login?next=/tv");
  });

  it("does not touch absolute, protocol-relative or relative URLs", async () => {
    const { withBasePath } = await loadWith("/atara");
    expect(withBasePath("http://127.0.0.1:8001/health")).toBe("http://127.0.0.1:8001/health");
    expect(withBasePath("//cdn.example/x.js")).toBe("//cdn.example/x.js");
    expect(withBasePath("#needs-attention")).toBe("#needs-attention");
  });
});

/**
 * basePath covers <Link>, the router and redirect(), and nothing else. A
 * fetch or location.href written as "/api/..." works in dev and then fails
 * behind a proxy that only forwards the sub-path -- so none may be written.
 */
describe("browser URLs go through withBasePath", () => {
  const SRC = path.resolve(process.cwd(), "src");
  // Server-to-service calls, not browser-to-app.
  const EXEMPT = new Set([path.join("core", "lib", "face", "face-service.ts")]);

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") sourceFiles(full, out);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("has no raw root-relative fetch, location.href, <a href> or <img src>", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file);
      if (EXEMPT.has(relative)) continue;
      const source = fs.readFileSync(file, "utf8");
      const patterns = [
        /\bfetch\((?!\s*withBasePath\()/g,
        /location\.href\s*=\s*["'`]\//g,
        /<a\b[^>]*\shref=["'{`]*\//g,
        /<img\b[^>]*\ssrc=["'{`]*\//g,
      ];
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          const line = source.slice(0, match.index).split("\n").length;
          offenders.push(`${relative}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
