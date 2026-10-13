import "server-only";

import { prisma } from "@/core/lib/prisma";
import { parseDeviceInfo } from "@/core/lib/auth/session-client";
import type { UserSessionDTO } from "@/modules/system/types";

/** How many ended sessions the list shows under the live ones. */
const RECENT_ENDED = 10;

const SESSION_SELECT = {
  id: true,
  client: true,
  device: true,
  deviceInfo: true,
  address: true,
  createdAt: true,
  endedAt: true,
  endedReason: true,
} as const;

/**
 * An account's sessions as an administrator sees them: every live one, then
 * the last few that ended and why. `currentSessionId` marks the admin's own,
 * which the list will not offer to end.
 */
export async function listUserSessions(
  userId: string,
  currentSessionId: string
): Promise<{ active: UserSessionDTO[]; recent: UserSessionDTO[] }> {
  const [active, recent] = await Promise.all([
    prisma.userSession.findMany({
      where: { userId, endedAt: null },
      orderBy: { createdAt: "desc" },
      select: SESSION_SELECT,
    }),
    prisma.userSession.findMany({
      where: { userId, endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      take: RECENT_ENDED,
      select: SESSION_SELECT,
    }),
  ]);

  const toDto = (row: (typeof active)[number]): UserSessionDTO => ({
    id: row.id,
    client: row.client,
    device: row.device,
    deviceInfo: parseDeviceInfo(row.deviceInfo),
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    endedReason: row.endedReason,
    isCurrent: row.id === currentSessionId,
  });

  return { active: active.map(toDto), recent: recent.map(toDto) };
}
