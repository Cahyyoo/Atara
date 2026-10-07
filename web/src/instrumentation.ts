/**
 * Runs once when the server starts, before the first request.
 *
 * The one job here is to refuse to start on a bad secret. Every secret used
 * to be checked only when first touched, so a server with the placeholder
 * JWT_SECRET from .env.example answered health checks, served pages, and only
 * revealed the problem to the first person who signed in -- or never, since a
 * placeholder signs perfectly valid tokens. A deployment that cannot start is
 * a deployment somebody notices.
 *
 * Node only. The edge runtime has no process.env of its own to check, and the
 * middleware that runs there verifies tokens with the same secret through
 * auth.ts, which re-checks it at first use anyway.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertSecrets } = await import("@/lib/env-guard");
  assertSecrets();

  // Checked here and not in env-guard: secret-box imports node:crypto, and
  // env-guard is reached from the edge middleware where that does not exist.
  const { assertMfaKey } = await import("@/lib/secret-box");
  assertMfaKey(process.env.MFA_ENCRYPTION_KEY);
}
