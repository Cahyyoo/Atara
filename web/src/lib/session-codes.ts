/**
 * The code a client switches on for the session answer that is not plain yes
 * or no. Here, with no server imports, so the browser can read it without
 * pulling the database client into its bundle.
 */

/** 401: a sign-in on another device ended this session. */
export const SESSION_REPLACED_CODE = "session-replaced";

/** 401: an administrator, or a password change, ended this session. */
export const SESSION_ENDED_CODE = "session-ended";

/**
 * 403: this account's password was chosen by an administrator and has to be
 * replaced before anything else. 403 rather than 401: the session is good,
 * and a client that signs out on 401 must not treat this as a sign-out.
 */
export const PASSWORD_CHANGE_REQUIRED_CODE = "password-change-required";

/** 400: the current password given for a password change was wrong. */
export const WRONG_PASSWORD_CODE = "wrong-password";

/** Why a session was ended for its device rather than by it. */
export type SessionEndedReason = "ADMIN_ENDED" | "PASSWORD_CHANGED";

export function isSessionEndedReason(value: unknown): value is SessionEndedReason {
  return value === "ADMIN_ENDED" || value === "PASSWORD_CHANGED";
}

/** The `reason` the sign-in page is sent, so it can say what happened. */
export const SIGN_IN_REASON = {
  replaced: "replaced",
  ADMIN_ENDED: "ended-admin",
  PASSWORD_CHANGED: "ended-password",
} as const;

/** 409: the role has no default password yet, so no account can be given it. */
export const NO_ROLE_DEFAULT_CODE = "no-role-default";

/** 400: the "new" password is the role's shared default. */
export const ROLE_DEFAULT_PASSWORD_CODE = "role-default-password";
