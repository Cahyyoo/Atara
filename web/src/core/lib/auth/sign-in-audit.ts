import "server-only";

import { SignInOutcome } from "@prisma/client";
import { prisma } from "@/core/lib/prisma";
import { clientAddressFromHeaders } from "@/core/lib/http/rate-limit";

/**
 * Writing down how a sign-in ended.
 *
 * The face step exists for non-repudiation and, until this, left no trace. A
 * session cookie proves somebody held a password; only this says whether a
 * face was checked as well, and that is the difference between "this account
 * did it" and "this person did it".
 *
 * Every call is awaited rather than fired and forgotten. An audit entry that
 * may or may not have been written is not an audit entry, and the database is
 * already load-bearing for a sign-in -- the account itself was read from it a
 * moment earlier -- so nothing new is being risked by depending on it here.
 */

export { SignInOutcome };

/**
 * Which outcomes mean a face was actually compared and matched.
 *
 * A set rather than a check inside the write, because `faceVerified` is stored
 * rather than derived: a new outcome added later must be given its answer
 * deliberately instead of inheriting one from a condition somebody forgot.
 */
const VERIFIED_BY_FACE = new Set<SignInOutcome>([SignInOutcome.FACE_VERIFIED]);

/**
 * Which outcomes mean an authenticator code was checked and accepted.
 *
 * TOTP_ENROLLED counts: the setup is only confirmed by a correct code, and
 * that same code is what signed the person in.
 */
const VERIFIED_BY_TOTP = new Set<SignInOutcome>([
  SignInOutcome.TOTP_VERIFIED,
  SignInOutcome.TOTP_ENROLLED,
]);

export interface SignInEvent {
  userId: string;
  outcome: SignInOutcome;
  /** The request, for the caller's address where one can be trusted. */
  headers: Headers;
}

export async function recordSignIn({ userId, outcome, headers }: SignInEvent): Promise<void> {
  await prisma.signInAudit.create({
    data: {
      userId,
      outcome,
      faceVerified: VERIFIED_BY_FACE.has(outcome),
      totpVerified: VERIFIED_BY_TOTP.has(outcome),
      // Null unless TRUST_PROXY says a proxy in front appends the header
      // itself. A column that quietly records whatever the caller claimed
      // would be worse than one that admits it does not know.
      address: clientAddressFromHeaders(headers),
    },
  });
}
