import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { ROLES, type Role } from "@/lib/permissions";
import { NO_ROLE_DEFAULT_CODE } from "@/lib/session-codes";
import type { RolePasswordStatus } from "@/lib/role-password-status";

/**
 * The default password of each role: what a new account starts on, and what
 * a forgotten password is reset to. Only hashes are kept, so the
 * administrator who set one is the only person who knows it, and the account
 * given it has to replace it on their next sign-in.
 */


export async function listRolePasswordStatus(): Promise<RolePasswordStatus[]> {
  const rows = await prisma.rolePasswordDefault.findMany({
    select: { role: true, updatedAt: true, updatedBy: { select: { name: true } } },
  });
  const byRole = new Map(rows.map((row) => [row.role, row]));
  return ROLES.map((role) => {
    const row = byRole.get(role);
    return {
      role,
      isSet: Boolean(row),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy?.name ?? null,
    };
  });
}

/** Sets (or replaces) a role's default. Accounts already on the old one keep it. */
export async function setRolePassword(role: Role, password: string, userId: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.rolePasswordDefault.upsert({
    where: { role },
    create: { role, passwordHash, updatedById: userId },
    update: { passwordHash, updatedById: userId },
  });
}

/**
 * The hash an account of this role is given. The hash is copied as it is,
 * so a later change to the default does not reach accounts already on it.
 */
export async function roleDefaultHash(role: Role): Promise<string> {
  const row = await prisma.rolePasswordDefault.findUnique({
    where: { role },
    select: { passwordHash: true },
  });
  if (!row) {
    throw new ApiError(
      `The ${role} role has no default password yet. Set it under Administration first.`,
      409,
      NO_ROLE_DEFAULT_CODE
    );
  }
  return row.passwordHash;
}

/** Whether a password is the role's shared default, which is nobody's own. */
export async function isRoleDefault(role: Role, password: string): Promise<boolean> {
  const row = await prisma.rolePasswordDefault.findUnique({
    where: { role },
    select: { passwordHash: true },
  });
  return row ? bcrypt.compare(password, row.passwordHash) : false;
}
