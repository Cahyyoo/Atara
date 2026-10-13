import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertFaceServiceToken,
  assertJwtSecret,
  assertSecrets,
  FACE_TOKEN_PLACEHOLDER,
  JWT_SECRET_PLACEHOLDER,
  MIN_JWT_SECRET_BYTES,
} from "@/core/lib/env-guard";
import { assertMfaKey } from "@/core/lib/auth/secret-box";

/**
 * The secrets are refused when they are not secrets.
 *
 * This app ran for weeks with JWT_SECRET set to the placeholder from
 * .env.example -- a public string in a public file -- and nothing said a word,
 * because the only check was "is it set". A session token is an HMAC over
 * that value, so anybody who knew an admin's id could have signed themselves
 * in as that admin. These tests hold the refusal in place.
 */

const EXAMPLE = readFileSync(join(process.cwd(), ".env.example"), "utf8");

function exampleValue(key: string): string {
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(EXAMPLE);
  if (!match) throw new Error(`${key} is not in .env.example`);
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const strong = () => randomBytes(32).toString("base64");

describe("the JWT secret", () => {
  /**
   * The literal in env-guard.ts must be the literal in .env.example. If the
   * example changes and this does not, the new placeholder sails through.
   */
  it("knows the placeholder .env.example actually ships", () => {
    expect(JWT_SECRET_PLACEHOLDER).toBe(exampleValue("JWT_SECRET"));
  });

  it("refuses the placeholder by name, and says where it came from", () => {
    expect(() => assertJwtSecret(JWT_SECRET_PLACEHOLDER)).toThrow(/\.env\.example/);
    // Quoted the way a hand-edited .env sometimes leaves it.
    expect(() => assertJwtSecret(`"${JWT_SECRET_PLACEHOLDER}"`)).toThrow(/\.env\.example/);
  });

  it("refuses anything shorter than the key size HS256 is named for", () => {
    expect(() => assertJwtSecret("a".repeat(MIN_JWT_SECRET_BYTES - 1))).toThrow(/at least 32/);
    expect(() => assertJwtSecret("")).toThrow(/not set/);
    expect(() => assertJwtSecret(undefined)).toThrow(/not set/);
  });

  it("accepts a real one", () => {
    const secret = strong();
    expect(assertJwtSecret(secret)).toBe(secret);
    expect(assertJwtSecret("a".repeat(MIN_JWT_SECRET_BYTES))).toHaveLength(MIN_JWT_SECRET_BYTES);
  });

  it("measures bytes, not characters", () => {
    // Sixteen two-byte characters are 32 bytes of key material.
    expect(() => assertJwtSecret("é".repeat(16))).not.toThrow();
    expect(() => assertJwtSecret("é".repeat(15))).toThrow();
  });
});

describe("the face service token", () => {
  it("refuses the placeholder the face service itself refuses", () => {
    expect(FACE_TOKEN_PLACEHOLDER).toBe(exampleValue("FACE_SERVICE_TOKEN"));
    expect(() => assertFaceServiceToken(FACE_TOKEN_PLACEHOLDER)).toThrow(/placeholder/);
  });

  it("applies the same floor as face/app/config.py", () => {
    const config = readFileSync(join(process.cwd(), "..", "face", "app", "config.py"), "utf8");
    expect(config).toContain("16");
    expect(() => assertFaceServiceToken("fifteen-chars!!")).toThrow(/at least 16/);
    expect(assertFaceServiceToken("sixteen-chars!!!")).toBe("sixteen-chars!!!");
  });
});

describe("at boot", () => {
  const good = {
    JWT_SECRET: strong(),
    FACE_SERVICE_TOKEN: "a-real-face-token-here",
    DATABASE_URL: "mysql://x",
  };

  it("passes a finished deployment", () => {
    expect(() => assertSecrets(good)).not.toThrow();
  });

  it("stops on the placeholder secret before serving a request", () => {
    expect(() => assertSecrets({ ...good, JWT_SECRET: JWT_SECRET_PLACEHOLDER })).toThrow(
      /\.env\.example/
    );
  });

  it("checks the MFA key at boot rather than at the first authenticator", () => {
    expect(() => assertMfaKey("")).toThrow(/MFA_ENCRYPTION_KEY/);
    expect(() => assertMfaKey("dG9vLXNob3J0")).toThrow(/32 bytes/);
    expect(() => assertMfaKey(strong())).not.toThrow();
    // Wired into startup, beside the other checks.
    const boot = readFileSync(join(process.cwd(), "src", "instrumentation.ts"), "utf8");
    expect(boot).toContain("assertMfaKey(process.env.MFA_ENCRYPTION_KEY)");
  });

  it("does not start without a database", () => {
    expect(() => assertSecrets({ ...good, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  /**
   * env-guard is reached from the middleware, which runs on the edge runtime.
   * Anything Node-only in its import graph -- node:crypto through secret-box,
   * or Buffer -- would throw there on every request. The first version did
   * exactly that, and the build only called it a warning.
   */
  it("stays free of Node-only modules, because the middleware imports it", () => {
    const guard = readFileSync(join(process.cwd(), "src", "core", "lib", "env-guard.ts"), "utf8");
    expect(guard).not.toMatch(/import[^\n]*secret-box/);
    expect(guard).not.toMatch(/from "node:/);
    expect(guard).not.toMatch(/\bBuffer\./);
  });
});

describe("the two token signers", () => {
  /**
   * Boot is one line somebody could delete. The signers refuse the same
   * secret at first use, so no path through the process can mint a token
   * with a key anybody could guess.
   */
  it("both go through the same refusal", () => {
    for (const file of [["auth", "auth.ts"], ["face", "face-challenge.ts"]]) {
      const source = readFileSync(join(process.cwd(), "src", "core", "lib", ...file), "utf8");
      expect(source).toContain("assertJwtSecret(process.env.JWT_SECRET)");
      expect(source).toContain('algorithms: ["HS256"]');
    }
  });

  it("are wired into startup", () => {
    const boot = readFileSync(join(process.cwd(), "src", "instrumentation.ts"), "utf8");
    expect(boot).toContain("assertSecrets()");
  });
});
