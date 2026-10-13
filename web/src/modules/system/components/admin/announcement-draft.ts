import type { Role } from "@/core/lib/auth/permissions";
import type { AnnouncementDTO } from "@/modules/system/types";

/** Where a banner stands at `now`: showing, waiting for its start, or over. */
export type Status = "active" | "scheduled" | "ended";

export function statusOf(announcement: AnnouncementDTO, now: number): Status {
  if (announcement.endsAt && new Date(announcement.endsAt).getTime() <= now) return "ended";
  if (new Date(announcement.startsAt).getTime() > now) return "scheduled";
  return "active";
}

/** The form's fields, as the inputs hold them (times as WITA datetime-local values). */
export interface Draft {
  message: string;
  tone: "INFO" | "WARNING";
  roles: Role[];
  startsAt: string;
  endsAt: string;
}

export const EMPTY: Draft = { message: "", tone: "INFO", roles: [], startsAt: "", endsAt: "" };
