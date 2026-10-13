import {
  IoFingerPrintOutline,
  IoPeopleOutline,
  IoSettingsOutline,
  IoShieldHalfOutline,
} from "react-icons/io5";
import type { AppModule } from "@/core/lib/app/module-types";

/**
 * The settings module ("Pengaturan"): the super admin's tools -- the
 * departments' admin accounts, announcements, the sign-in trail and the
 * backup. The lab admin works in it too, for Users only: the same page,
 * scoped to their own staff (user-scope.ts), so its menu shows them just that.
 */
export const systemModule = {
  key: "system",
  basePath: "/admin",
  homePath: "/admin",
  icon: IoShieldHalfOutline,
  personas: ["SUPER_ADMIN", "LAB_ADMIN"],
  nav: [
    { href: "/users", key: "users", icon: IoPeopleOutline, capability: "manageUsers" },
    { href: "/admin", key: "admin", icon: IoSettingsOutline, capability: "manageAnnouncements" },
    { href: "/admin/sign-ins", key: "signInAudit", icon: IoFingerPrintOutline, capability: "viewSignInAudit" },
  ],
  helpSections: [
    { key: "users", icon: IoPeopleOutline, href: "/users", capability: "manageUsers" },
    { key: "admin", icon: IoSettingsOutline, href: "/admin", capability: "manageAnnouncements" },
  ],
  tours: [
    {
      key: "users",
      path: "/users",
      steps: [
        { target: "users-search" },
        { target: "users-add", savesData: true },
        { target: "users-verification" },
        { target: "users-edit", optional: true },
        { target: "users-more", optional: true },
      ],
    },
    {
      key: "admin",
      path: "/admin",
      steps: [
        { target: "admin-message" },
        { target: "admin-audience" },
        { target: "admin-times" },
        { target: "admin-publish", savesData: true },
        { target: "admin-backup", optional: true },
      ],
    },
  ],
} as const satisfies AppModule;
