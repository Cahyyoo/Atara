import type { Prisma } from "@prisma/client";
import { personaOf, type Access, type Department, type Role } from "@/lib/permissions";

/**
 * Whose accounts each manager may touch.
 *
 * `manageUsers` (permissions.ts) opens the Users page; this narrows it to the
 * accounts behind it. The super admin manages the departments' admins; a
 * department's admin manages its own staff. Nobody manages the super admin,
 * which only the seed creates -- so there is exactly one -- and nobody
 * manages anybody in another department.
 *
 * Pure: the role picker in the browser offers exactly what the routes accept.
 */

export interface ManagedTarget {
  role: Role;
  department: Department;
}

export function manageableTargets(access: Access): readonly ManagedTarget[] {
  switch (personaOf(access)) {
    case "SUPER_ADMIN":
      return [
        { role: "ADMIN", department: "LAB" },
        { role: "ADMIN", department: "EKSPLORASI" },
      ];
    case "LAB_ADMIN":
      return [
        { role: "DATABASE", department: "LAB" },
        { role: "ANALISIS", department: "LAB" },
        { role: "OPERATOR", department: "LAB" },
      ];
    default:
      return [];
  }
}

/** Whether `access` may give an account this role in this department. */
export function canAssign(access: Access, role: Role, department: Department | null): boolean {
  return manageableTargets(access).some((t) => t.role === role && t.department === department);
}

/** Whether `access` may manage an account that is this role in this department. */
export function canManage(access: Access, target: Access): boolean {
  return canAssign(access, target.role, target.department);
}

/** The roles `access` may hand out, in the order the picker lists them. */
export function assignableRoles(access: Access): Role[] {
  return [...new Set(manageableTargets(access).map((t) => t.role))];
}

/** The departments `access` may put a role in. */
export function assignableDepartments(access: Access, role: Role): Department[] {
  return manageableTargets(access)
    .filter((t) => t.role === role)
    .map((t) => t.department);
}

/** The accounts `access` may see on the Users page, as a query filter. */
export function userScopeWhere(access: Access): Prisma.UserWhereInput {
  const targets = manageableTargets(access);
  // Matches nothing: no manager, no list.
  if (targets.length === 0) return { id: { in: [] } };
  return { OR: targets.map((t) => ({ role: t.role, department: t.department })) };
}
