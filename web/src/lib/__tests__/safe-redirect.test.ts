import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a path on this site", () => {
    expect(safeRedirectPath("/database")).toBe("/database");
    expect(safeRedirectPath("/lab/samples/NKL-2026-00001")).toBe("/lab/samples/NKL-2026-00001");
    expect(safeRedirectPath("/database?placeId=abc123&page=2")).toBe("/database?placeId=abc123&page=2");
  });

  it("falls back when nothing was asked for", () => {
    expect(safeRedirectPath(null)).toBe("/home");
    expect(safeRedirectPath(undefined)).toBe("/home");
    expect(safeRedirectPath("")).toBe("/home");
  });

  it("refuses an absolute URL to another origin", () => {
    // The whole point: sign in on the real site, get handed to the attacker's.
    expect(safeRedirectPath("https://evil.example/login")).toBe("/home");
    expect(safeRedirectPath("http://evil.example")).toBe("/home");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/home");
    expect(safeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe("/home");
  });

  it("refuses protocol-relative and backslash-smuggled origins", () => {
    // A browser reads each of these as "go to evil.example", not as a local path.
    expect(safeRedirectPath("//evil.example")).toBe("/home");
    expect(safeRedirectPath("//evil.example/dashboard")).toBe("/home");
    expect(safeRedirectPath("/\\evil.example")).toBe("/home");
    expect(safeRedirectPath("/\\/evil.example")).toBe("/home");
  });

  it("refuses control characters that could reshape the URL", () => {
    // Written as escapes on purpose: a raw control byte in the source made
    // git treat this file as binary, and hid what was actually being tested.
    expect(safeRedirectPath("/\u0000//evil.example")).toBe("/home");
    expect(safeRedirectPath("/\n//evil.example")).toBe("/home");
    expect(safeRedirectPath("/\r//evil.example")).toBe("/home");
    expect(safeRedirectPath("/\t/evil.example")).toBe("/home");
  });

  it("leaves an inner space alone, which is not a way off-site", () => {
    // This resolves against our own origin with the space encoded, so it stays
    // local. Asserting what it really does rather than what would sound safer.
    expect(safeRedirectPath("/ //evil.example")).toBe("/ //evil.example");
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/login")).toBe("/login");
  });
});
