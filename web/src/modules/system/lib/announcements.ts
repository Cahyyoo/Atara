import "server-only";

import type { Announcement } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { isRole, type Role } from "@/core/lib/auth/permissions";
import { TtlCache } from "@/core/lib/ttl-cache";
import type { AnnouncementDTO } from "@/modules/system/types";

/** The roles an announcement is for; null means everybody. */
export function rolesOf(value: unknown): Role[] | null {
  if (!Array.isArray(value)) return null;
  const roles = value.filter(isRole);
  return roles.length > 0 ? roles : null;
}

export function toAnnouncementDTO(
  row: Announcement & { createdBy?: { name: string } | null }
): AnnouncementDTO {
  return {
    id: row.id,
    message: row.message,
    tone: row.tone,
    roles: rolesOf(row.roles),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    createdBy: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Whether an announcement is up at `now` for somebody holding `role`. */
export function isShownTo(announcement: AnnouncementDTO, role: Role, now: Date): boolean {
  const started = new Date(announcement.startsAt) <= now;
  const notEnded = announcement.endsAt === null || new Date(announcement.endsAt) > now;
  const forRole = announcement.roles === null || announcement.roles.includes(role);
  return started && notEnded && forRole;
}

/**
 * Every announcement that is live or still to come. A handful of rows at most,
 * read on every page render, so cached for half a minute and filtered per role
 * in memory rather than with a JSON query.
 */
const cache = new TtlCache<AnnouncementDTO[]>(30_000, 1);

function loadCurrent(now: Date): Promise<AnnouncementDTO[]> {
  return cache.get("current", async () => {
    const rows = await prisma.announcement.findMany({
      where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      orderBy: [{ tone: "desc" }, { startsAt: "desc" }],
      take: 50,
    });
    return rows.map((row) => toAnnouncementDTO(row));
  });
}

/** What the banner shows this person now: warnings first, then newest. */
export async function loadActiveAnnouncements(
  role: Role,
  now: Date = new Date()
): Promise<AnnouncementDTO[]> {
  const current = await loadCurrent(now);
  return current.filter((announcement) => isShownTo(announcement, role, now));
}

/** After an administrator adds, changes, ends or removes one. */
export function invalidateAnnouncements(): void {
  cache.invalidate();
}
