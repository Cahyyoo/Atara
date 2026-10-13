/** Input schemas every module shares: passwords. Each module keeps its own in its validation.ts. */
import { z } from "zod";

/**
 * One rule for every password that gets set: by an administrator for somebody
 * else, or by the person for themselves. The upper bound keeps bcrypt, which
 * reads only the first 72 bytes anyway, from being handed megabytes.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.");

/** Somebody changing their own password: the current one proves it is them. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(128),
    newPassword: passwordSchema,
  })
  .refine((body) => body.newPassword !== body.currentPassword, {
    message: "The new password must be different from the current one.",
    path: ["newPassword"],
  });
