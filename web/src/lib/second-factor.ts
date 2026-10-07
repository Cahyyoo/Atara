/**
 * The ways past the password step, and which of them an account has.
 *
 * Shared by the login route that decides and the login form that shows the
 * choice, so the two cannot disagree about what a method is called.
 *
 *   face        -- a face is enrolled
 *   totp        -- an authenticator app is set up
 *   totp-setup  -- an admin asked for one and it has not been set up yet;
 *                  the person does it now, and their first code signs them in
 *
 * The setup is offered straight after the password only to an account with
 * no face. An account that signs in by face is asked for the face first, and
 * the face step then hands over to the setup itself -- otherwise a pending
 * request from an admin would have turned the account into a password-only
 * one for as long as it stood, since the setup route accepted any challenge
 * and the password step hands those out.
 */
export const SECOND_FACTOR_METHODS = ["face", "totp", "totp-setup"] as const;
export type SecondFactorMethod = (typeof SECOND_FACTOR_METHODS)[number];

/**
 * How long an admin's request stays open.
 *
 * A request is a standing invitation to bind a phone to the account on the
 * strength of the password alone (plus the face, where there is one). One
 * forgotten for a month is a month-long window nobody is watching; a day is
 * long enough to find the app and scan a code.
 */
export const TOTP_SETUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A request that is still open: made, not yet completed, not yet stale. */
export function totpSetupPending(
  user: { totpEnabledAt: Date | null; totpRequestedAt: Date | null },
  now: number = Date.now()
): boolean {
  if (user.totpEnabledAt || !user.totpRequestedAt) return false;
  return now - user.totpRequestedAt.getTime() <= TOTP_SETUP_WINDOW_MS;
}

export function secondFactorMethods(
  {
    hasFace,
    totpEnabledAt,
    totpRequestedAt,
  }: {
    hasFace: boolean;
    totpEnabledAt: Date | null;
    totpRequestedAt: Date | null;
  },
  now: number = Date.now()
): SecondFactorMethod[] {
  const methods: SecondFactorMethod[] = [];
  if (hasFace) methods.push("face");
  if (totpEnabledAt) methods.push("totp");
  else if (!hasFace && totpSetupPending({ totpEnabledAt, totpRequestedAt }, now)) {
    methods.push("totp-setup");
  }
  return methods;
}

export function isSecondFactorMethod(value: unknown): value is SecondFactorMethod {
  return SECOND_FACTOR_METHODS.includes(value as SecondFactorMethod);
}

/**
 * The refusal code for a wrong or reused authenticator code, so the form can
 * say it in the reader's language instead of showing the server's English.
 */
export const TOTP_MISMATCH_CODE = "totp-mismatch";
