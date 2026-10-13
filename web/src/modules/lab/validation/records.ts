/** Input schemas for lab records: results, weights, the record list, history and imports. */
import { z } from "zod";
import { identityFieldsShape } from "@/modules/lab/validation/samples";

/**
 * Which records a figure counts: the samples themselves (the default -- a
 * fraction's grade must not pull a head sample's average about), every
 * record, or the sub-samples alone.
 */
export const SUB_FILTERS = ["parents", "all", "subs"] as const;
export type SubFilter = (typeof SUB_FILTERS)[number];

const percentageSchema = z.coerce
  .number()
  .min(0, "Value cannot be negative.")
  .max(100, "Percentage cannot exceed 100.")
  .nullable()
  .optional();

export const updateLabRecordSchema = z.object({
  ni: percentageSchema,
  fe: percentageSchema,
  co: percentageSchema,
  sio2: percentageSchema,
  mgo: percentageSchema,
  cao: percentageSchema,
  al2o3: percentageSchema,
  cr: percentageSchema,
  fe2o3: percentageSchema,
  cr2o3: percentageSchema,
  mno: percentageSchema,
  na2o: percentageSchema,
  p2o5: percentageSchema,
  tio2: percentageSchema,
  s: percentageSchema,
  co2: percentageSchema,
  zn: percentageSchema,
  // The instrument's own total. Not a percentage of anything, so it is allowed
  // past 100 rather than being rejected when a run reports an odd figure.
  sum: z.coerce.number().min(0).max(1000).nullable().optional(),
  measurementMethod: z.string().trim().max(191).nullable().optional(),
  solutionId: z.string().trim().max(191).nullable().optional(),
  measurementFinished: z.coerce.date().nullable().optional(),
  xrayInstrument: z.string().trim().max(191).nullable().optional(),

  ...identityFieldsShape,
  remarks: z.string().trim().max(1000).nullable().optional(),
});

/** A weighing in grams, for the moisture content. */
const weightSchema = z.coerce
  .number()
  .min(0, "A weight cannot be negative.")
  .max(100_000, "A weight cannot exceed 100,000 g.")
  .nullable()
  .optional();

/** Wp, W0 and Wd: written by the Database role only, never by a results paste. */
export const mcWeightsShape = { wp: weightSchema, w0: weightSchema, wd: weightSchema };

/** The record dialog in the Sample Database: everything, the weighing included. */
export const updateDatabaseRecordSchema = updateLabRecordSchema.extend(mcWeightsShape);

/**
 * The Wp/W0/Wd paste: rows named by Sample ID, found on the server. A weight
 * left out keeps the stored one. `dryRun` only says what would change.
 */
export const updateWeightsSchema = z.object({
  rows: z
    .array(
      z.object({
        line: z.number().int().min(1),
        key: z.string().trim().min(1).max(191),
        wp: z.number().min(0).max(100_000).optional(),
        w0: z.number().min(0).max(100_000).optional(),
        wd: z.number().min(0).max(100_000).optional(),
      })
    )
    .min(1, "Nothing to save.")
    .max(500, "Maximum 500 rows at a time."),
  dryRun: z.boolean().default(false),
});

export const LAB_RECORD_SORT_FIELDS = [
  "labCode",
  "shiftDate",
  "sequence",
  "updatedAt",
  "ni",
  "fe",
  "co",
  "sio2",
  "mgo",
  "cao",
  "al2o3",
  "cr",
  "fe2o3",
  "cr2o3",
  "mno",
  "na2o",
  "p2o5",
  "tio2",
  "s",
  "co2",
  "zn",
  "sum",
  // Plain columns on the lab record, so these order directly — no
  // relation to traverse, unlike the identity ones.
  "measurementMethod",
  "solutionId",
  "measurementFinished",
  "xrayInstrument",
] as const;

/** "missing": no Ni yet. "present": Ni entered. */
export const LAB_RESULT_FILTERS = ["missing", "present"] as const;
export type LabResultFilter = (typeof LAB_RESULT_FILTERS)[number];

/** Whether a sample has its Sample ID yet: barcodes are made first, identity later. */
export const IDENT_FILTERS = ["has", "missing"] as const;
export type IdentFilter = (typeof IDENT_FILTERS)[number];

/** What sets a sub-sample apart, as written between the brackets: "-20". */
export const subCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[^()]+$/, "A sub code cannot contain brackets.");

export const listLabRecordsQuerySchema = z.object({
  search: z.string().trim().optional(),
  placeId: z.string().trim().min(1).optional(),
  sort: z.enum(LAB_RECORD_SORT_FIELDS).default("shiftDate"),
  order: z.enum(["asc", "desc"]).default("desc"),
  shiftDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Shift date must use the YYYY-MM-DD format.")
    .optional(),
  /** A range of shift days, both ends inclusive; either may be left open. */
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use the YYYY-MM-DD format.")
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use the YYYY-MM-DD format.")
    .optional(),
  /** Whether a result has been entered yet, judged by Ni alone. */
  results: z.enum(LAB_RESULT_FILTERS).optional(),
  ident: z.enum(IDENT_FILTERS).optional(),
  /** Also count how many match with and without a result, for the filter's labels. */
  counts: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  /** Admin-only: lists what was deleted instead of what remains. */
  deleted: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  /** Export only: each sample's sub-samples as rows of their own, right after it. */
  subs: z
    .enum(["include", "exclude"])
    .optional()
    .transform((value) => value === "include"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const bulkUpdateLabRecordsSchema = z.object({
  records: z
    .array(
      updateLabRecordSchema
        .extend({
          id: z.string().trim().min(1).optional(),
          // In place of an id: a sub-sample to create under this parent, or
          // to fill if it is already there.
          parentId: z.string().trim().min(1).optional(),
          subCode: subCodeSchema.optional(),
        })
        .refine((record) => Boolean(record.id) !== Boolean(record.parentId && record.subCode), {
          message: "Each row needs either a record id, or a parent and a sub code.",
        })
    )
    .min(1, "Nothing to save.")
    .max(200, "Save at most 200 records at a time."),
  reason: z.string().trim().max(1000).optional(),
  /**
   * A result that already has a value is replaced only when this says so:
   * filling an empty field is safe, overwriting one is a decision.
   */
  overwrite: z.boolean().default(false),
});

/** The history of result updates, as the history page filters it. */
export const historyQuerySchema = z.object({
  search: z.string().trim().max(191).optional(),
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** "results" (the default): only changes that touch a result. */
  changes: z.enum(["results", "all"]).default("results"),
  page: z.coerce.number().int().min(1).default(1),
});

/** The pasted Sample IDs to look up across every record, no ticking needed. */
export const resolveLabRecordsSchema = z.object({
  keys: z.array(z.string().trim().min(1).max(191)).min(1).max(500),
});

export const importLabRecordsSchema = z.object({
  csv: z.string().min(1, "The file is empty.").max(2_000_000),
  /** False returns a preview only; nothing is written until this is true. */
  apply: z.boolean().default(false),
  reason: z.string().trim().max(1000).optional(),
  /** As on a bulk save: earlier results are replaced only when this says so. */
  overwrite: z.boolean().default(false),
});
