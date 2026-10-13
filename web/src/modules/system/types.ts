/** What the system module's routes send to the browser: accounts, sessions, announcements. */
import type { Department } from "@/core/lib/auth/permissions";
import type { DeviceInfo } from "@/core/lib/auth/session-client";
import type { UserRole } from "@/core/types";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** The module the account works in; null for the super admin. */
  department: Department | null;
  isActive: boolean;
  /** Set while the account is locked out after failed sign-ins. */
  lockedUntil: string | null;
  createdAt: string;
  /** How many face readings are enrolled; never the readings themselves. */
  _count?: { faceEnrollments: number };
  /** An admin asked for an authenticator app; set up at the next sign-in. */
  totpRequestedAt: string | null;
  /** When the authenticator app was set up; null while off or still pending. */
  totpEnabledAt: string | null;
  /** The password an administrator set; the person replaces it at their next sign-in. */
  mustChangePassword?: boolean;
}

/** A banner above every page; see announcements.ts. */
export interface AnnouncementDTO {
  id: string;
  message: string;
  tone: "INFO" | "WARNING";
  /** Null for everybody. */
  roles: UserRole[] | null;
  startsAt: string;
  endsAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** One signed-in device of an account, as the admin's sessions list shows it. */
export interface UserSessionDTO {
  id: string;
  client: "WEB" | "MOBILE";
  device: string | null;
  deviceInfo: DeviceInfo | null;
  address: string | null;
  createdAt: string;
  endedAt: string | null;
  endedReason: "REPLACED" | "LOGOUT" | "ADMIN_ENDED" | "PASSWORD_CHANGED" | null;
  /** The administrator's own session, which the list does not offer to end. */
  isCurrent: boolean;
}
