import type { PaginationDTO } from "@/core/types";
import type { SignInOutcomeName } from "@/modules/system/lib/sign-in-audit-query";

/** What /api/sign-in-audit answers: one page of attempts, the per-outcome totals, and who can be picked. */
export interface AuditEntry {
  id: string;
  createdAt: string;
  outcome: SignInOutcomeName;
  faceVerified: boolean;
  totpVerified: boolean;
  address: string | null;
  userId: string;
  userName: string;
  userEmail: string;
}

export interface OutcomeTotal {
  outcome: SignInOutcomeName;
  total: number;
}

export interface AuditResponse {
  entries: AuditEntry[];
  summary: OutcomeTotal[];
  users: { id: string; name: string; email: string; isActive: boolean }[];
  pagination: PaginationDTO;
}

export const COLUMN_COUNT = 5;

/** The lab reads every timestamp on its own clock, not the browser's. */
export const LAB_TIMEZONE = "Asia/Makassar";

/**
 * How each outcome should look.
 *
 * A full map rather than a condition, so an outcome added to the schema later
 * cannot inherit a colour from a branch somebody forgot: the type requires an
 * entry for every name.
 */
export const OUTCOME_TONE: Record<SignInOutcomeName, "default" | "secondary" | "destructive"> = {
  FACE_VERIFIED: "default",
  TOTP_VERIFIED: "default",
  TOTP_ENROLLED: "default",
  // Not a failure — somebody did sign in — but not a proof of person either,
  // and that is the whole reason this table exists. Neutral, never green.
  PASSWORD_ONLY: "secondary",
  FACE_MISMATCH: "destructive",
  TOTP_MISMATCH: "destructive",
  FACE_UNREADABLE: "destructive",
  FACE_SERVICE_DOWN: "destructive",
  PASSWORD_FAILED: "destructive",
  ACCOUNT_LOCKED: "destructive",
  ACCOUNT_INACTIVE: "destructive",
  // Somebody signed in elsewhere; nothing failed. Worth noticing, not alarming.
  SESSION_REPLACED: "secondary",
  PASSWORD_CHANGED: "secondary",
  SESSION_ENDED_BY_ADMIN: "secondary",
};
