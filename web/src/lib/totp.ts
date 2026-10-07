import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords, RFC 6238, in the one shape every
 * authenticator app agrees on: HMAC-SHA1, six digits, thirty seconds.
 *
 * Microsoft Authenticator, Google Authenticator and the rest all read the
 * same otpauth:// URI, and all of them ignore anything more exotic than this
 * -- a SHA256 or eight-digit setting is silently dropped by some apps, which
 * then show codes that never work. So none of it is configurable.
 *
 * Written out rather than pulled in: it is forty lines of HMAC, pinned by the
 * RFC's own test vectors, and a dependency here would be one more thing
 * between the second factor and the code that checks it.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_ISSUER = "ATARA";

/** 160 bits, the length RFC 4226 recommends for an HMAC-SHA1 key. */
const SECRET_BYTES = 20;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** Lenient about case, spaces and padding, because people type these in. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 character.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/** A fresh secret, base32 as the authenticator app expects it. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** Which 30-second step a moment falls in. */
export function timeStep(now: number = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/** RFC 4226 HOTP for one counter value, `digits` long. */
export function hotp(secret: Buffer, counter: number, digits: number = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", secret).update(message).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    (hash[offset + 1] << 16) |
    (hash[offset + 2] << 8) |
    hash[offset + 3];
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function totpAt(secret: string, now: number = Date.now()): string {
  return hotp(base32Decode(secret), timeStep(now));
}

/**
 * The step a code belongs to, or null if it matches none.
 *
 * One step either side is accepted, because a phone clock a few seconds off
 * or a code typed as it rolled over is the ordinary case, not an attack.
 * Returning the step rather than a boolean is what lets the caller refuse the
 * same code twice: a code is only single-use if somebody remembers it was
 * used.
 */
export function verifyTotp(
  code: string,
  secret: string,
  { window = 1, now = Date.now() }: { window?: number; now?: number } = {}
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const current = timeStep(now);
  const given = Buffer.from(code);

  let matched: number | null = null;
  // Every candidate is compared, match or not, so the time taken does not say
  // which step was right.
  for (let offset = -window; offset <= window; offset++) {
    const step = current + offset;
    if (step < 0) continue;
    if (timingSafeEqual(Buffer.from(hotp(key, step)), given) && matched === null) {
      matched = step;
    }
  }
  return matched;
}

/**
 * What the QR code carries.
 *
 * The label is "issuer:account" and the issuer is repeated as a parameter:
 * older apps read one, newer ones the other, and Microsoft Authenticator shows
 * the issuer as the entry's title.
 */
export function otpauthUri({ account, secret }: { account: string; secret: string }): string {
  const label = `${encodeURIComponent(TOTP_ISSUER)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** The secret in groups of four, for anyone typing it in by hand. */
export function formatManualKey(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}
