import type { UserDTO } from "@/modules/system/types";

export function isLockedOut(user: UserDTO): boolean {
  return user.lockedUntil !== null && new Date(user.lockedUntil) > new Date();
}

/**
 * How an account's state reads at a glance.
 *
 * Deactivated is deliberately grey, not red: it is a state an admin chose,
 * not something going wrong, and painting it like an error made every
 * retired account shout. Locked is the one that stays red, because it is the
 * one that wants something done about it (the unlock is in Edit).
 */
export function statusOf(user: UserDTO): {
  key: "statusDeactivated" | "statusLocked" | "statusActive";
  className: string;
  dot: string;
} {
  if (!user.isActive) {
    return { key: "statusDeactivated", className: "text-muted-foreground", dot: "bg-muted-foreground/50" };
  }
  if (isLockedOut(user)) {
    return { key: "statusLocked", className: "font-medium text-destructive", dot: "bg-destructive" };
  }
  return { key: "statusActive", className: "text-foreground", dot: "bg-primary" };
}
