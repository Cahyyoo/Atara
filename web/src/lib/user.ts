import type { Prisma } from "@prisma/client";

/** Every user response goes through this select, so the password hash can never leak. */
export const USER_SELECT = {
  mustChangePassword: true,
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
  isActive: true,
  lockedUntil: true,
  createdAt: true,
  /**
   * Whether a face is enrolled, as a count rather than the descriptors.
   *
   * The descriptors themselves must never travel to a browser: the server
   * compares them and only its verdict comes back. A count answers everything
   * the Users screen needs -- enrolled or not -- and carries nothing.
   */
  _count: { select: { faceEnrollments: true } },
  /**
   * The authenticator's state, as dates only. The secret itself is sealed in
   * the database and is never part of any response.
   */
  totpRequestedAt: true,
  totpEnabledAt: true,
} satisfies Prisma.UserSelect;
