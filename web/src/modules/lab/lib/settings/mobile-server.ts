import "server-only";

import { randomUUID } from "node:crypto";
import { ApiError } from "@/core/lib/http/api-response";
import { prisma } from "@/core/lib/prisma";
import { getLabSettings } from "@/modules/lab/lib/settings/lab-settings";
import { checkMobileServerUrl, normaliseMobileServerUrl } from "@/modules/lab/lib/settings/mobile-server-url";

const SERVER_ID_KEY = "serverId";
let serverId: string | undefined;

/**
 * This installation's identity, made once and kept in `lab_settings`.
 *
 * It travels with the database, so a server moved to a new address keeps it,
 * and a phone can tell "the same lab, somewhere else" from a stranger.
 */
export async function getServerId(): Promise<string> {
  if (serverId) return serverId;
  // An upsert that changes nothing on update: two first requests at once both
  // read whichever id landed first.
  const row = await prisma.labSetting.upsert({
    where: { key: SERVER_ID_KEY },
    create: { key: SERVER_ID_KEY, value: randomUUID() },
    update: {},
  });
  serverId = String(row.value);
  return serverId;
}

/**
 * The address to store, once it has been shown to answer as this server.
 * Throws an ApiError the settings form words for the admin.
 */
export async function acceptMobileServerUrl(input: string): Promise<string> {
  const url = normaliseMobileServerUrl(input);
  if (url === null) {
    throw new ApiError("That is not an address the app can use. Use http://host:port/api.", 422, "MOBILE_SERVER_URL_INVALID");
  }
  // Clearing it, or saving what is already there, cannot strand anyone.
  if (url === "" || url === (await getLabSettings()).mobileServerUrl) return url;

  switch (await checkMobileServerUrl(url, await getServerId())) {
    case "ok":
      return url;
    case "unreachable":
      throw new ApiError("This server could not reach that address.", 502, "MOBILE_SERVER_UNREACHABLE");
    case "otherServer":
      throw new ApiError("That address does not answer as this Atara server.", 409, "MOBILE_SERVER_OTHER");
  }
}
