import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The response headers, pinned.
 *
 * One of these silently broke face enrolment: Permissions-Policy carried
 * `camera=()`, an empty allowlist, which disables the feature for every origin
 * including this one. The browser then refuses getUserMedia at the policy
 * level and never shows a prompt, so the dialog reported that access had been
 * refused by someone who was never asked.
 *
 * Nothing failed. No error, no warning, no test — the camera simply never
 * opened, and the only clue was a message blaming the wrong party.
 */

const CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

function permissionsPolicy(): string {
  const match = /value:\s*"(camera=[^"]*)"/.exec(CONFIG);
  if (!match) throw new Error("no Permissions-Policy value found in next.config.ts");
  return match[1];
}

describe("Permissions-Policy", () => {
  it("lets this origin use the camera", () => {
    // `camera=(self)`, not `camera=()`. The empty list is the bug, and the two
    // look almost identical in a diff.
    expect(permissionsPolicy()).toMatch(/\bcamera=\(self\)/);
    expect(permissionsPolicy()).not.toMatch(/\bcamera=\(\)/);
  });

  it("does not open the camera to embedders", () => {
    // `*` would let any page that frames this one use the camera through it.
    // frame-ancestors already forbids framing, but two locks on a camera is
    // the right number.
    expect(permissionsPolicy()).not.toMatch(/\bcamera=\*/);
  });

  it("keeps everything this app does not use shut", () => {
    // The fix was one word wide; it must not have widened anything else.
    for (const feature of ["microphone", "geolocation", "payment"]) {
      expect(permissionsPolicy()).toContain(`${feature}=()`);
    }
  });
});

describe("the headers that were already right", () => {
  it("still refuses framing and sniffing", () => {
    expect(CONFIG).toContain('key: "X-Frame-Options", value: "DENY"');
    expect(CONFIG).toContain('key: "X-Content-Type-Options", value: "nosniff"');
    expect(CONFIG).toContain("frame-ancestors 'none'");
  });

  it("still keeps the app talking only to itself", () => {
    expect(CONFIG).toContain("connect-src 'self'");
    expect(CONFIG).toContain("form-action 'self'");
  });
});
