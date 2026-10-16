/** Input schemas for the lab's reports: the dashboard's analytics. */
import { z } from "zod";
import { SUB_FILTERS } from "@/modules/lab/validation/records";

export const analyticsQuerySchema = z.object({
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  placeId: z.string().trim().min(1).optional(),
  rockTypeId: z.string().trim().min(1).optional(),
  nonProdId: z.string().trim().min(1).optional(),
  pitId: z.string().trim().min(1).optional(),
  sirId: z.string().trim().min(1).optional(),
  subs: z.enum(SUB_FILTERS).default("parents"),
});
