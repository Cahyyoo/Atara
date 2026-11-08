import "server-only";

import { randomUUID } from "node:crypto";
import { ApiError } from "@/core/lib/http/api-response";
import { prisma } from "@/core/lib/prisma";
import { TtlCache } from "@/core/lib/ttl-cache";
import { checkMobileServerUrl, normaliseMobileServerUrl } from "@/modules/system/lib/mobile-server-url";

const SERVER_URL_KEY = "mobileServerUrl";
const SERVER_ID_KEY = "serverId";

/**
 * Fifteen seconds: every phone asks on each launch, resume and reconnect, and
 * a change reaching them within a few of those is soon enough.
 */
const cache = new TtlCache<string>(15_000, 1);
let serverId: string | undefined;

/**
 * This installation's identity, made once and kept in `system_settings`.
 *
 * It travels with the database, so a server moved to a new address keeps it,
 * and a phone can tell "the same lab, somewhere else" from a stranger.
 */
export async function getServerId(): Promise<string> {
  if (serverId) return serverId;
  // An upsert that changes nothing on update: two first requests at once both
  // read whichever id landed first.
  const row = await prisma.systemSetting.upsert({
    where: { key: SERVER_ID_KEY },
    create: { key: SERVER_ID_KEY, value: randomUUID() },
    update: {},
  });
  serverId = String(row.value);
  return serverId;
}

/**
 * The server address every mobile app follows, as http(s)://host:port/api.
 * Empty means each app keeps its built-in address.
 */
export function getMobileServerUrl(): Promise<string> {
  return cache.get("url", async () => {
    const row = await prisma.systemSetting.findUnique({ where: { key: SERVER_URL_KEY } });
    return typeof row?.value === "string" ? row.value : "";
  });
}

/**
 * Stores the address once it has been shown to answer as this server, and
 * returns it as stored. Throws an ApiError the admin panel words for the reader.
 *
 * `force` saves an address this server could not reach at all. The server's
 * view of the network is not the phones': it may be unable to call its own
 * domain (hairpin NAT, an IPv6 record it has no route to) while every phone
 * can. Each phone still checks the address itself before it moves. It never
 * saves an address where a different server answered.
 */
export async function setMobileServerUrl(
  input: string,
  userId: string,
  { force = false }: { force?: boolean } = {}
): Promise<string> {
  const url = normaliseMobileServerUrl(input);
  if (url === null) {
    throw new ApiError("That is not an address the app can use. Use http://host:port/api.", 422, "MOBILE_SERVER_URL_INVALID");
  }
  // Clearing it, or saving what is already there, cannot strand anyone.
  if (url !== "" && url !== (await getMobileServerUrl())) {
    const check = await checkMobileServerUrl(url, await getServerId());
    if (check === "unreachable" && !force) {
      throw new ApiError("This server could not reach that address.", 502, "MOBILE_SERVER_UNREACHABLE");
    }
    if (check === "otherServer") {
      throw new ApiError("That address does not answer as this Atara server.", 409, "MOBILE_SERVER_OTHER");
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: SERVER_URL_KEY },
    create: { key: SERVER_URL_KEY, value: url, updatedById: userId },
    update: { value: url, updatedById: userId },
  });
  cache.invalidate();
  return url;
}
