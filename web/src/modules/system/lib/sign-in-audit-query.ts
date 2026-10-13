import { z } from "zod";
import type { Prisma, SignInOutcome } from "@prisma/client";
import { workdayBounds, parseDayInput } from "@/core/lib/wita-time";

/**
 * Asking questions of the sign-in trail.
 *
 * Kept apart from `sign-in-audit.ts`, which writes. That file is `server-only`
 * and imports the Prisma client; this one is imported by the table in the
 * browser for the outcome list, so it must stay free of both. The types below
 * are type-only imports for exactly that reason -- a value import of
 * `SignInOutcome` would pull the generated client into the bundle.
 */

/**
 * Every outcome, in the order a reader should meet them: the two that end in a
 * session and say a second factor was checked, then the plain one, then the
 * refusals, then the failures.
 *
 * Not sorted alphabetically, because the distinction this whole table exists
 * for -- verified against password-only -- would be scattered.
 */
export const SIGN_IN_OUTCOMES = [
  "FACE_VERIFIED",
  "TOTP_VERIFIED",
  "TOTP_ENROLLED",
  "PASSWORD_ONLY",
  "FACE_MISMATCH",
  "TOTP_MISMATCH",
  "FACE_UNREADABLE",
  "FACE_SERVICE_DOWN",
  "PASSWORD_FAILED",
  "ACCOUNT_LOCKED",
  "ACCOUNT_INACTIVE",
  // Not attempts on this account but events in its life: a sign-in on another
  // device ended the session here, the owner changed the password, or an
  // administrator ended sessions. Last, after the attempts themselves.
  "SESSION_REPLACED",
  "PASSWORD_CHANGED",
  "SESSION_ENDED_BY_ADMIN",
] as const satisfies readonly SignInOutcome[];

export type SignInOutcomeName = (typeof SIGN_IN_OUTCOMES)[number];

/**
 * Compile-time proof the list above is the whole enum.
 *
 * `satisfies` catches a typo or an outcome that no longer exists; it cannot
 * catch one that was added to the schema and never listed here. That omission
 * is the silent kind: the new outcome would be written to the table, would
 * never appear in the filter, and the rows carrying it would look like a gap
 * in the trail rather than a gap in this array. Exported because an unused
 * const is a lint error, and because naming it says what it is for.
 */
export const OUTCOME_LIST_IS_COMPLETE: Exclude<
  SignInOutcome,
  SignInOutcomeName
> extends never
  ? true
  : never = true;

/** The filters a question about the trail can carry, already parsed. */
export interface SignInAuditFilters {
  userId?: string;
  outcome?: SignInOutcomeName;
  /** Lab days, inclusive at both ends, as yyyy-mm-dd. */
  from?: string;
  to?: string;
}

/**
 * One `where` for the list, the count, the summary and the export.
 *
 * Built once for the same reason the stage trail's is: four callers asking the
 * same question four slightly different ways is how a download ends up
 * covering a different set than the rows it was started from.
 */
export function signInAuditWhere(filters: SignInAuditFilters): Prisma.SignInAuditWhereInput {
  const where: Prisma.SignInAuditWhereInput = {};

  if (filters.userId) {
    where.userId = filters.userId;
  }
  if (filters.outcome) {
    where.outcome = filters.outcome;
  }

  /**
   * A lab day at each end, not a calendar day.
   *
   * The shift turns over at 07:00 WITA, so a sign-in at 06:30 belongs to the
   * day before -- and an auditor asking "who signed in on the 12th" means the
   * shift the lab calls the 12th. `to` is inclusive: it takes the end of that
   * day, because a range that silently excluded its own last day would be read
   * wrong by everyone who used it.
   */
  const range: Prisma.DateTimeFilter = {};
  const from = filters.from ? parseDayInput(filters.from) : null;
  const to = filters.to ? parseDayInput(filters.to) : null;

  if (from) {
    range.gte = workdayBounds(from).from;
  }
  if (to) {
    range.lt = workdayBounds(to).to;
  }
  if (range.gte || range.lt) {
    where.createdAt = range;
  }

  return where;
}

/** Everything a row of the trail shows, and nothing else. */
export const signInAuditSelect = {
  id: true,
  createdAt: true,
  outcome: true,
  faceVerified: true,
  totpVerified: true,
  address: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.SignInAuditSelect;

export const listSignInAuditQuerySchema = z.object({
  /** The person is chosen by id, not typed: the trail is not searched by name. */
  userId: z.string().trim().optional(),
  outcome: z.enum(SIGN_IN_OUTCOMES).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  /**
   * Only the direction, because there is only one thing to sort a trail by.
   * Newest first by default: an audit is read from the last thing that
   * happened backwards, not from the beginning of time forwards.
   */
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
