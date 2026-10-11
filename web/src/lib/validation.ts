import { z } from "zod";
import { DEPARTMENTS, ROLES } from "@/lib/permissions";
import {
  DEFAULT_RESULT_AGE_DAYS,
  IDENTITY_GAPS,
  QUALITY_CHECKS,
  RESULT_AGE_DAYS,
} from "@/lib/data-quality-checks";
import {
  MAX_SCAN_HISTORY_DAYS,
  SCAN_HISTORY_DEFAULT_PAGE_SIZE,
} from "@/lib/scan-history";
import { DRILL_HOLE_STATUSES } from "@/lib/drill-hole";

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

/** The data-quality page's list: which check, which column, how old. */
/**
 * Which records a figure counts: the samples themselves (the default -- a
 * fraction's grade must not pull a head sample's average about), every
 * record, or the sub-samples alone.
 */
export const SUB_FILTERS = ["parents", "all", "subs"] as const;
export type SubFilter = (typeof SUB_FILTERS)[number];

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
 * Filling in the identity of many records at once. A field left out (or
 * empty) is not touched; `sampleNoStart` numbers the samples in the order the
 * ids are given. `dryRun` reports the Sample IDs it would produce.
 */
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

/**
 * One rule for every password that gets set: by an administrator for somebody
 * else, or by the person for themselves. The upper bound keeps bcrypt, which
 * reads only the first 72 bytes anyway, from being handed megabytes.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.");

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
  role: z.enum(ROLES).default("OPERATOR"),
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

export const listUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
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

export const updateStageSchema = z.object({
  description: z.string().trim().max(1000).nullable().optional(),
});


// ---------------------------------------------------------------------------
// Eksplorasi: drill holes
// ---------------------------------------------------------------------------

/** An optional number in a range; an empty field arrives as null. */
const optionalNumber = (min: number, max: number) =>
  z.coerce.number().min(min).max(max).nullable().optional();

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must use the YYYY-MM-DD format.")
  .nullable()
  .optional();

const drillHoleFields = {
  holeId: z.string().trim().min(1, "Hole ID is required.").max(50),
  area: z.string().trim().max(100).nullable().optional(),
  easting: optionalNumber(-999_999_999, 999_999_999),
  northing: optionalNumber(-999_999_999, 999_999_999),
  elevation: optionalNumber(-99_999, 99_999),
  azimuth: optionalNumber(0, 360),
  dip: optionalNumber(-90, 90),
  totalDepth: optionalNumber(0, 99_999),
  status: z.enum(DRILL_HOLE_STATUSES),
  startDate: optionalDate,
  endDate: optionalDate,
  remarks: z.string().trim().max(5000).nullable().optional(),
};

/** A hole cannot finish before it started. Compared as strings: both are YYYY-MM-DD. */
function datesInOrder(body: { startDate?: string | null; endDate?: string | null }) {
  return !body.startDate || !body.endDate || body.endDate >= body.startDate;
}
const DATES_IN_ORDER = { message: "End date cannot be before the start date.", path: ["endDate"] };

export const createDrillHoleSchema = z
  .object({ ...drillHoleFields, status: drillHoleFields.status.default("PLANNED") })
  .refine(datesInOrder, DATES_IN_ORDER);

export const updateDrillHoleSchema = z
  .object(drillHoleFields)
  .partial()
  .refine(datesInOrder, DATES_IN_ORDER);

/**
 * One row of an imported sheet. Like a new hole, except that a blank status
 * stays blank: on a hole that already exists, an empty cell leaves the stored
 * value alone (drill-hole-upsert.ts), and a default here would overwrite it.
 */
export const importDrillHoleRowSchema = z
  .object({ ...drillHoleFields, status: drillHoleFields.status.optional() })
  .refine(datesInOrder, DATES_IN_ORDER);

export const listDrillHolesQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(DRILL_HOLE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
