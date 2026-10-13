import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "@/core/lib/auth/secret-box";

const KEY = randomBytes(32).toString("base64");

describe("sealing an authenticator secret", () => {
  it("opens to what was sealed", () => {
    expect(openSecret(sealSecret("GEZDGNBVGY3TQOJQ", KEY), KEY)).toBe("GEZDGNBVGY3TQOJQ");
  });

  it("does not store the secret in the clear", () => {
    expect(sealSecret("GEZDGNBVGY3TQOJQ", KEY)).not.toContain("GEZDGNBVGY3TQOJQ");
  });

  it("seals the same secret differently every time", () => {
    expect(sealSecret("same", KEY)).not.toBe(sealSecret("same", KEY));
  });

  it("refuses a value that was altered", () => {
    const [iv, tag, ciphertext] = sealSecret("GEZDGNBVGY3TQOJQ", KEY).split(".");
    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] ^= 1;
    expect(() => openSecret([iv, tag, flipped.toString("base64url")].join("."), KEY)).toThrow();
  });

  it("refuses to open under another key", () => {
    const other = randomBytes(32).toString("base64");
    expect(() => openSecret(sealSecret("GEZDGNBVGY3TQOJQ", KEY), other)).toThrow();
  });

  it("says so when the key is missing or the wrong length", () => {
    expect(() => sealSecret("x", undefined)).toThrow(/MFA_ENCRYPTION_KEY/);
    expect(() => sealSecret("x", randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
