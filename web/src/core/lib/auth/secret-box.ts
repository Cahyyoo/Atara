import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Sealing a secret before it is written to the database.
 *
 * Unlike a password, a TOTP secret cannot be hashed: the server has to read it
 * back to work out the current code. What it can be is useless on its own, so
 * a backup or a leaked dump of the users table does not hand anybody a working
 * authenticator. AES-256-GCM, so a sealed value that was tampered with fails
 * to open rather than opening as something else.
 *
 * Stored as `iv.tag.ciphertext`, each part base64url.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function keyFrom(encoded: string | undefined): Buffer {
  if (!encoded) {
    throw new Error("MFA_ENCRYPTION_KEY environment variable is not set.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

/** Boot-time check; the rule for the key's shape lives here and nowhere else. */
export function assertMfaKey(encoded: string | undefined): void {
  keyFrom(encoded);
}

export function sealSecret(
  plaintext: string,
  encodedKey: string | undefined = process.env.MFA_ENCRYPTION_KEY
): string {
  const key = keyFrom(encodedKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

/** Throws if the value was altered or sealed under another key. */
export function openSecret(
  sealed: string,
  encodedKey: string | undefined = process.env.MFA_ENCRYPTION_KEY
): string {
  const key = keyFrom(encodedKey);
  const parts = sealed.split(".");
  if (parts.length !== 3) {
    throw new Error("Sealed secret is malformed.");
  }
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  // The tag length pinned, so a truncated tag -- which GCM would otherwise
  // accept, at a fraction of the forgery cost -- fails to open.
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
