/**
 * The secrets this app runs on, checked before it serves a request.
 *
 * Each of these used to be checked only for being set, and only when first
 * used. That let a deployment start "healthy" with the placeholder from
 * `.env.example` still in place -- and this app's own `.env` sat that way for
 * weeks. A session token is an HMAC over a secret; with the secret a public
 * string in a public file, anybody who knew an admin's id could sign
 * themselves an admin session and walk past the password, the face, the
 * authenticator, the lockout and the audit trail in one step. Nothing in the
 * app could tell that token from a real one, because it *was* a real one.
 *
 * So the placeholders are refused by name, the lengths are enforced, and it
 * all happens at boot (see instrumentation.ts) rather than at the first
 * sign-in. The face service already does exactly this for its own token
 * (face/app/config.py); this brings the web side up to the same rule.
 *
 * Every check also runs again at first use (auth.ts, face-challenge.ts), so a
 * process that somehow skipped instrumentation still cannot sign with a bad
 * secret.
 */

/**
 * The literal from `.env.example`, so it can be refused by name.
 *
 * A test holds this in step with the file. Refusing on length alone would
 * not do: the placeholder is 49 characters, comfortably past any sane
 * minimum, and it is the one value we know for certain is public.
 */
export const JWT_SECRET_PLACEHOLDER = "change-this-to-a-long-random-secret-in-production";
export const FACE_TOKEN_PLACEHOLDER = "change-me";

/** 256 bits: the key size HS256 is named for. */
export const MIN_JWT_SECRET_BYTES = 32;
/** The same floor face/app/config.py applies to the value it receives. */
export const MIN_FACE_TOKEN_CHARS = 16;

/** Strips the quotes a hand-edited .env sometimes leaves inside the value. */
function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

export function assertJwtSecret(secret: string | undefined): string {
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set.");
  }
  const value = unquote(secret);
  if (value === JWT_SECRET_PLACEHOLDER) {
    throw new Error(
      "JWT_SECRET is still the placeholder from .env.example. Anyone who has read that " +
        "file can sign a session. Generate a real one: " +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  // TextEncoder rather than Buffer: auth.ts is imported by the middleware,
  // which runs on the edge runtime, and Buffer does not exist there. A
  // check that threw ReferenceError on every request would have taken the
  // whole site down to make its point.
  const bytes = new TextEncoder().encode(value).length;
  if (bytes < MIN_JWT_SECRET_BYTES) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_BYTES} bytes; it is ${bytes}.`);
  }
  return value;
}

export function assertFaceServiceToken(token: string | undefined): string {
  if (!token) {
    // A missing token is a deployment that was never finished, not a runtime
    // condition to degrade around.
    throw new Error(
      "FACE_SERVICE_TOKEN is not set. See face/README.md; it must match the service's own .env."
    );
  }
  const value = unquote(token);
  if (value === FACE_TOKEN_PLACEHOLDER) {
    throw new Error("FACE_SERVICE_TOKEN is still the placeholder from .env.example.");
  }
  if (value.length < MIN_FACE_TOKEN_CHARS) {
    throw new Error(`FACE_SERVICE_TOKEN must be at least ${MIN_FACE_TOKEN_CHARS} characters.`);
  }
  return value;
}

/** Only the keys this reads, so a test can hand in exactly those. */
export type SecretEnv = Partial<
  Record<"JWT_SECRET" | "FACE_SERVICE_TOKEN" | "DATABASE_URL", string>
>;

/**
 * Everything this module can check, once, at startup.
 *
 * Not `MFA_ENCRYPTION_KEY`: its format is owned by secret-box.ts, which
 * imports node:crypto, and this file is reached from the middleware -- the
 * edge runtime, where node:crypto does not exist. Even a dynamic import of it
 * here was enough for the bundler to drag it into the middleware. So that
 * check is made by instrumentation.ts, which only ever runs under Node.
 *
 * `DATABASE_URL` is only checked for presence: Prisma validates the rest, and
 * a wrong one fails loudly on its own.
 */
export function assertSecrets(env: SecretEnv = process.env as SecretEnv): void {
  assertJwtSecret(env.JWT_SECRET);
  assertFaceServiceToken(env.FACE_SERVICE_TOKEN);

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
}
