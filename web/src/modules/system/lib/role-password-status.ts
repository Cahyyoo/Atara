import type { Role } from "@/core/lib/auth/permissions";

/** Where a role's default password stands -- never the password or its hash. */
export interface RolePasswordStatus {
  role: Role;
  isSet: boolean;
  /** ISO time it was last set. */
  updatedAt: string | null;
  /** Name of who set it. */
  updatedBy: string | null;
}
