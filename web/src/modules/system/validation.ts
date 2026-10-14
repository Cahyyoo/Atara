/** Input schemas of the system module: accounts, announcements, default passwords. */
import { z } from "zod";
import { DEPARTMENTS, ROLES } from "@/core/lib/auth/permissions";
import { passwordSchema } from "@/core/lib/validation";

/**
 * An announcement as the administrator writes it. Times arrive as ISO
 * strings; an end before the start would never show, so it is refused.
 */
export const announcementSchema = z
  .object({
    message: z.string().trim().min(1, "Write the announcement.").max(500),
    tone: z.enum(["INFO", "WARNING"]).default("INFO"),
    roles: z.array(z.enum(ROLES)).max(ROLES.length).nullable().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine((body) => !body.endsAt || body.endsAt > (body.startsAt ?? new Date()), {
    message: "The end must be after the start.",
    path: ["endsAt"],
  });

/** Changing one: any field, or `end: true` to take it down now. */
export const updateAnnouncementSchema = z
  .object({
    message: z.string().trim().min(1).max(500).optional(),
    tone: z.enum(["INFO", "WARNING"]).optional(),
    roles: z.array(z.enum(ROLES)).max(ROLES.length).nullable().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    end: z.boolean().optional(),
  })
  .refine((body) => !body.endsAt || !body.startsAt || body.endsAt > body.startsAt, {
    message: "The end must be after the start.",
    path: ["endsAt"],
  });

/**
 * A new account starts on its role's default password; nobody types one here.
 *
 * The department may be left out when the role fits only one the caller can
 * give (a lab admin's staff are all LAB). Which pairs the caller may create
 * is user-scope.ts's to say, not the schema's.
 */
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(191),
  email: z.string().trim().email("Invalid email address."),
  role: z.enum(ROLES).default("PREPARATOR"),
  department: z.enum(DEPARTMENTS).nullable().optional(),
});

/**
 * No password: an administrator only ever resets one to the role's default
 * (`POST /api/users/[id]/reset-password`), and their own is changed like
 * anybody's, with the current one.
 */
export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(191).optional(),
  role: z.enum(ROLES).optional(),
  department: z.enum(DEPARTMENTS).nullable().optional(),
  isActive: z.boolean().optional(),
  /** Clears a sign-in lockout so the user does not have to wait it out. */
  unlock: z.boolean().optional(),
});

/** An administrator setting a role's default password. */
export const rolePasswordSchema = z.object({
  role: z.enum(ROLES),
  password: passwordSchema,
});

export const listUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
