/** Input schemas for the master vocabularies a Sample ID is built from. */
import { z } from "zod";

export const MASTER_KINDS = ["PLACE", "ROCK_TYPE", "NON_PROD", "PIT", "SIR"] as const;

/**
 * A master code ends up inside a Sample ID, whose segments are separated by
 * space, "/" and ".". Letting any of those into a code would make the composed
 * id ambiguous and unparseable, so they are refused at the door.
 */
const masterCodeSchema = z
  .string()
  .trim()
  .min(1, "Code is required.")
  .max(16, "Keep the code short — it appears inside every Sample ID.")
  .regex(/^[A-Za-z0-9-]+$/, "Use letters, digits and hyphens only.");

export const createMasterOptionSchema = z.object({
  kind: z.enum(MASTER_KINDS),
  code: masterCodeSchema,
  label: z.string().trim().max(191).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export const updateMasterOptionSchema = z.object({
  code: masterCodeSchema.optional(),
  label: z.string().trim().max(191).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Deleting a code. One that sits inside Sample IDs needs a replacement of the
 * same kind to move those records onto; `dryRun` reports what that would do
 * without doing it.
 */
export const deleteMasterOptionSchema = z.object({
  replacementId: z.string().trim().min(1).optional(),
  dryRun: z.boolean().optional(),
});

export const listMasterOptionsQuerySchema = z.object({
  kind: z.enum(MASTER_KINDS).optional(),
  activeOnly: z.coerce.boolean().optional(),
  /**
   * Also count how many lab records use each option. Five GROUP BY passes
   * over the biggest table, so only the Master Data screen -- which locks a
   * code once it is in use -- asks for it. Every dropdown gets the cached
   * plain list.
   */
  withUsage: z.coerce.boolean().optional(),
});
