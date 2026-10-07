import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  formatManualKey,
  generateTotpSecret,
  hotp,
  otpauthUri,
  timeStep,
  totpAt,
  verifyTotp,
} from "@/lib/totp";

/**
 * The code that decides whether a six-digit number opens an account.
 *
 * Pinned to the RFC's own test vectors rather than to codes this file
 * produced: an implementation checked only against itself would agree with
 * itself forever and disagree with every phone.
 */

/** The RFC 6238 appendix B key, "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("base32", () => {
  it("encodes the RFC key as authenticator apps expect", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("round-trips arbitrary bytes", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 17, 42]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("forgives what people do when typing a key in", () => {
    expect(base32Decode("gezd gnbv-gy3t qojq====")).toEqual(base32Decode("GEZDGNBVGY3TQOJQ"));
  });

  it("refuses characters outside the alphabet", () => {
    expect(() => base32Decode("GEZD1")).toThrow();
  });
});

describe("RFC 6238 appendix B, SHA1", () => {
  const key = Buffer.from("12345678901234567890");
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  for (const [seconds, expected] of vectors) {
    it(`gives ${expected} at T=${seconds}`, () => {
      expect(hotp(key, timeStep(seconds * 1000), 8)).toBe(expected);
    });
  }

  it("gives the six-digit form the apps show", () => {
    expect(totpAt(RFC_SECRET, 59_000)).toBe("287082");
  });
});

describe("verifyTotp", () => {
  const now = 1_700_000_000_000;
  const secret = generateTotpSecret();

  it("accepts the current code and says which step it was", () => {
    expect(verifyTotp(totpAt(secret, now), secret, { now })).toBe(timeStep(now));
  });

  it("accepts one step either side, for a phone clock a little off", () => {
    expect(verifyTotp(totpAt(secret, now - 30_000), secret, { now })).toBe(timeStep(now) - 1);
    expect(verifyTotp(totpAt(secret, now + 30_000), secret, { now })).toBe(timeStep(now) + 1);
  });

  it("refuses a code from further away than that", () => {
    expect(verifyTotp(totpAt(secret, now - 90_000), secret, { now })).toBeNull();
    expect(verifyTotp(totpAt(secret, now + 90_000), secret, { now })).toBeNull();
  });

  it("refuses another account's code", () => {
    const other = generateTotpSecret();
    const code = totpAt(other, now);
    // Vanishingly unlikely to collide, but a collision would be the one case
    // this test cannot tell apart from a bug.
    if (code !== totpAt(secret, now)) {
      expect(verifyTotp(code, secret, { now })).toBeNull();
    }
  });

  it("refuses anything that is not six digits", () => {
    for (const code of ["", "12345", "1234567", "12345a", " 123456", "123 456"]) {
      expect(verifyTotp(code, secret, { now })).toBeNull();
    }
  });
});

describe("the secret and what carries it", () => {
  it("is 160 bits, fresh every time", () => {
    const a = generateTotpSecret();
    expect(base32Decode(a)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(a);
  });

  it("goes into an otpauth URI Microsoft Authenticator reads", () => {
    const uri = new URL(otpauthUri({ account: "ops@atara.local", secret: RFC_SECRET }));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/ATARA:ops@atara.local");
    expect(uri.searchParams.get("secret")).toBe(RFC_SECRET);
    expect(uri.searchParams.get("issuer")).toBe("ATARA");
    expect(uri.searchParams.get("algorithm")).toBe("SHA1");
    expect(uri.searchParams.get("digits")).toBe("6");
    expect(uri.searchParams.get("period")).toBe("30");
  });

  it("is grouped in fours for typing", () => {
    expect(formatManualKey("GEZDGNBVGY")).toBe("GEZD GNBV GY");
  });
});
