/** Input schemas for the lab's reports: the dashboard's analytics and the data-quality list. */
import { z } from "zod";
import { DEFAULT_RESULT_AGE_DAYS, IDENTITY_GAPS, QUALITY_CHECKS, RESULT_AGE_DAYS } from "@/modules/lab/lib/analytics/data-quality-checks";
import { SUB_FILTERS } from "@/modules/lab/validation/records";

export const dataQualityQuerySchema = z.object({
  check: z.enum(QUALITY_CHECKS).default("identity"),
  subs: z.enum(SUB_FILTERS).default("parents"),
  gap: z.enum(IDENTITY_GAPS).optional(),
  days: z.coerce
    .number()
    .int()
    .refine((value) => (RESULT_AGE_DAYS as readonly number[]).includes(value))
    .default(DEFAULT_RESULT_AGE_DAYS),
  page: z.coerce.number().int().min(1).default(1),
});

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
