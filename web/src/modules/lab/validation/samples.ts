/** Input schemas for samples: creating, scanning, identity, stages and the sample list. */
import { z } from "zod";
import { MAX_SCAN_HISTORY_DAYS, SCAN_HISTORY_DEFAULT_PAGE_SIZE } from "@/modules/lab/lib/stages/scan-history";

/**
 * The nine columns a Sample ID is composed from.
 *
 * Shared between editing a record and generating new ones: two copies would
 * differ on a bound or a trim eventually, and the two paths write the same
 * columns.
 */
export const identityFieldsShape = {
  // Each is a master-option id, so an unknown value is caught by the foreign
  // key rather than becoming a silent new vocabulary.
  placeId: z.string().trim().min(1).nullable().optional(),
  rockTypeId: z.string().trim().min(1).nullable().optional(),
  nonProdId: z.string().trim().min(1).nullable().optional(),
  pitId: z.string().trim().min(1).nullable().optional(),
  sirId: z.string().trim().min(1).nullable().optional(),
  bargingNo: z.string().trim().max(32).nullable().optional(),
  sequenceNo: z.coerce.number().int().min(0).max(999999).nullable().optional(),
  sampleNo: z.coerce.number().int().min(0).max(999999).nullable().optional(),
  sackCount: z.coerce.number().int().min(0).max(99999).nullable().optional(),
};

export const createSampleSchema = z.object({
  ...identityFieldsShape,
});

/**
 * One identity per barcode, so the list length is the quantity.
 *
 * Deliberately not accepting the old `{ quantity, ...identity }` shape as well.
 * It would still parse against nothing and create a single sample, which is the
 * worst possible answer for an operator who believed they had asked for fifty.
 */
export const generateSamplesSchema = z.object({
  identities: z
    .array(
      z.object({
        // Optional throughout: a barcode sometimes has to be printed before the
        // barging run is known, and that sample is identified later.
        ...identityFieldsShape,
      })
    )
    .min(1, "At least one sample identity is required.")
    .max(500, "Maximum 500 samples per generation."),
});

export const scanSampleSchema = z.object({
  sample_code: z.string().trim().min(1, "Sample code is required."),
  stage_id: z.string().trim().min(1, "Stage must be selected."),
  // Accepted for backwards compatibility with the mobile app, but ignored:
  // the operator is always taken from the authenticated session.
  operator_id: z.string().trim().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  // Operators only (overrideStage): overrides the stage order, and requires a reason.
  force: z.boolean().optional(),
  reason: z.string().trim().min(5, "Please explain the correction.").max(1000).optional(),
});

/** The identity columns a bulk edit can set or clear. */
export const IDENTITY_KEYS = [
  "placeId",
  "rockTypeId",
  "nonProdId",
  "pitId",
  "sirId",
  "bargingNo",
  "sequenceNo",
  "sampleNo",
  "sackCount",
] as const;
export type IdentityKey = (typeof IDENTITY_KEYS)[number];

/** How many records one bulk identity change may touch, across all its groups. */
export const BULK_IDENTITY_LIMIT = 200;

/** One set of records given the same identity change. */
export const bulkIdentityGroupSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1).max(BULK_IDENTITY_LIMIT, "At most 200 records at a time."),
    set: z.object({ ...identityFieldsShape }).default({}),
    /** Columns to empty on every record -- the only way to take a value away. */
    clear: z.array(z.enum(IDENTITY_KEYS)).max(IDENTITY_KEYS.length).default([]),
    sampleNoStart: z.coerce.number().int().min(0).max(999999).nullable().optional(),
  })
  .refine(
    (body) =>
      body.clear.every(
        (key) =>
          (body.set as Record<string, unknown>)[key] === undefined ||
          (body.set as Record<string, unknown>)[key] === null
      ),
    { message: "A column cannot be both changed and cleared.", path: ["clear"] }
  )
  .refine((body) => !(body.clear.includes("sampleNo") && body.sampleNoStart != null), {
    message: "Sample numbers cannot be both cleared and numbered.",
    path: ["clear"],
  });

/**
 * Several groups, each with its own change -- one per Sample ID in the
 * dialog -- applied together, so a clash between two groups is caught too.
 */
export const bulkIdentitySchema = z
  .object({
    groups: z.array(bulkIdentityGroupSchema).min(1).max(BULK_IDENTITY_LIMIT),
    dryRun: z.boolean().optional(),
  })
  .refine((body) => body.groups.reduce((total, group) => total + group.ids.length, 0) <= BULK_IDENTITY_LIMIT, {
    message: "At most 200 records at a time.",
    path: ["groups"],
  })
  .refine(
    (body) => {
      const ids = body.groups.flatMap((group) => group.ids);
      return new Set(ids).size === ids.length;
    },
    { message: "A record can only be in one group.", path: ["groups"] }
  );

/** An administrator correcting a sample's stage from the website. */
export const correctStageSchema = z.object({
  stageId: z.string().trim().min(1, "Choose a stage."),
  reason: z.string().trim().min(5, "Please explain the correction.").max(1000),
});

export const SAMPLE_SORT_FIELDS = [
  "sampleCode",
  "status",
  "createdAt",
  "updatedAt",
] as const;

export const listSamplesQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
  stageId: z.string().trim().optional(),
  sort: z.enum(SAMPLE_SORT_FIELDS).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  ident: z.enum(["has", "missing"]).optional(),
});

/**
 * Deleting is soft and reversible, so one schema serves both directions: the
 * same ids, with a flag saying which way. A separate restore endpoint would be
 * the same permission check and the same guard written twice.
 */
export const deleteSamplesSchema = z.object({
  ids: z
    .array(z.string().trim().min(1))
    .min(1, "Select at least one sample.")
    .max(500, "Maximum 500 samples at a time."),
  restore: z.boolean().default(false),
});

/**
 * The signed-in operator asking for their own scans.
 *
 * Every field is optional with a default that reproduces this endpoint's
 * original behaviour exactly, so the route needs no legacy branch: the
 * defaults ARE the old behaviour, and the test in validation.test.ts is what
 * keeps them that way.
 *
 * No `from`/`to`. Those are shift dates, and computing one means knowing the
 * 07:00 WITA calendar; the only caller is a phone that deliberately does not.
 * Offering a parameter a client cannot compute correctly is an invitation to
 * compute it wrongly -- a handset using its local date would be a full day out
 * for every scan between midnight and 07:00, which is half of night shift.
 */
export const myScanHistoryQuerySchema = z.object({
  /** Shift days back from the current one, inclusive. 1 is the current shift. */
  days: z.coerce.number().int().min(1).max(MAX_SCAN_HISTORY_DAYS).default(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(SCAN_HISTORY_DEFAULT_PAGE_SIZE),
});

export const updateStageSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
});
