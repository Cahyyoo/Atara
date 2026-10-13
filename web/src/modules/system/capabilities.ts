import type { Persona } from "@/core/lib/auth/permissions";

/**
 * Who may do what in the system module -- accounts, announcements, the
 * sign-in trail, the backup -- by persona. Merged in src/modules/capabilities.ts.
 */
export const SYSTEM_CAPABILITIES = {
  /**
   * The Users page. Which accounts each holder may touch is narrower than
   * this and lives in user-scope.ts: the super admin manages the department
   * admins, a department admin manages its own staff.
   */
  manageUsers: ["SUPER_ADMIN", "LAB_ADMIN"],
  /** Banners above every page, for everybody or for some roles. */
  manageAnnouncements: ["SUPER_ADMIN"],
  /** Who signed in, from where, and who was refused. */
  viewSignInAudit: ["SUPER_ADMIN"],
  /** The whole database as one workbook, for safekeeping. */
  exportBackup: ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly Persona[]>;
