/**
 * The server address the mobile apps use, as the lab admin types it.
 *
 * Every phone follows this address, so a typo would point the whole lab at
 * nothing, and the app has no field left to fix it with. Hence the strict
 * shape here, and the check that the address really answers as this server.
 */

/** Where a server tells phones its address. Relative to the address itself. */
export const MOBILE_CONFIG_PATH = "/mobile-config";

/**
 * The address in the one form phones are given, or null for anything a phone
 * could not use. Empty stays empty: it means "the app's built-in address".
 */
export function normaliseMobileServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  // The API root, so a reverse-proxy base path such as /atara/api is kept.
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/api")) return null;
  return `${url.protocol}//${url.host}${path}`;
}

export type MobileServerCheck = "ok" | "unreachable" | "otherServer";

/**
 * Whether `url` answers as the server identified by `serverId`.
 *
 * Asked by this server, so it proves the address works from here, not from a
 * phone; each phone asks again before it switches.
 */
export async function checkMobileServerUrl(
  url: string,
  serverId: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5_000
): Promise<MobileServerCheck> {
  let response: Response;
  try {
    response = await fetchImpl(`${url}${MOBILE_CONFIG_PATH}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return "unreachable";
  }
  // Something answered, but not this server's config: another app, another
  // Atara installation, or a page that is not the API.
  const body = (await response.json().catch(() => null)) as { data?: { serverId?: unknown } } | null;
  return response.ok && body?.data?.serverId === serverId ? "ok" : "otherServer";
}
