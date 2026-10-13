import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { secondFactorMethods, totpSetupPending, TOTP_SETUP_WINDOW_MS } from "@/core/lib/auth/second-factor";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

const LOGIN = read("app", "api", "(core)", "auth", "login", "route.ts");
const TOTP = read("app", "api", "(core)", "auth", "totp", "route.ts");
const SETUP = read("app", "api", "(core)", "auth", "totp", "setup", "route.ts");
const FACE = read("app", "api", "(core)", "auth", "face", "route.ts");
const USER_SELECT = read("modules", "system", "lib", "user.ts");

describe("which second factors an account is offered", () => {
  const at = new Date("2026-09-25T00:00:00Z");

  it("offers nothing to an account with no second factor", () => {
    expect(
      secondFactorMethods({ hasFace: false, totpEnabledAt: null, totpRequestedAt: null })
    ).toEqual([]);
  });

  it("offers both when there is a face and an authenticator", () => {
    expect(
      secondFactorMethods({ hasFace: true, totpEnabledAt: at, totpRequestedAt: at })
    ).toEqual(["face", "totp"]);
  });

  it("offers the setup while an admin's request is pending", () => {
    expect(
      secondFactorMethods({ hasFace: false, totpEnabledAt: null, totpRequestedAt: at }, at.getTime())
    ).toEqual(["totp-setup"]);
  });

  /**
   * The bypass this closes. With a face enrolled and a request pending, the
   * setup used to be offered right after the password -- so the request
   * turned the account into a password-only one for as long as it stood.
   * Now the face comes first and hands over to the setup itself.
   */
  it("asks a face account for the face before it offers the setup", () => {
    expect(
      secondFactorMethods({ hasFace: true, totpEnabledAt: null, totpRequestedAt: at }, at.getTime())
    ).toEqual(["face"]);
  });

  it("lets a forgotten request lapse", () => {
    const later = at.getTime() + TOTP_SETUP_WINDOW_MS + 1;
    expect(
      secondFactorMethods({ hasFace: false, totpEnabledAt: null, totpRequestedAt: at }, later)
    ).toEqual([]);
    expect(totpSetupPending({ totpEnabledAt: null, totpRequestedAt: at }, later)).toBe(false);
    expect(totpSetupPending({ totpEnabledAt: null, totpRequestedAt: at }, at.getTime())).toBe(true);
  });
});

describe("the authenticator routes", () => {
  it("withhold the session from anyone with a second factor", () => {
    // The check that matters: the cookie is only issued after the branch
    // that returns a challenge instead.
    expect(LOGIN.indexOf("methods.length > 0")).toBeGreaterThan(-1);
    expect(LOGIN.indexOf("methods.length > 0")).toBeLessThan(
      LOGIN.indexOf("issueSessionResponse(user")
    );
  });

  it("spend the challenge only once the code is right", () => {
    // A mistyped digit must not send somebody back to the password.
    expect(TOTP.indexOf("SignInOutcome.TOTP_MISMATCH")).toBeLessThan(
      TOTP.indexOf("claimNonce(challenge.nonce)")
    );
    expect(TOTP.indexOf("issueSessionResponse(user,")).toBeGreaterThan(-1);
    expect(TOTP.indexOf("claimNonce(challenge.nonce)")).toBeLessThan(
      TOTP.indexOf("issueSessionResponse(user,")
    );
  });

  it("refuse a code that was already used", () => {
    expect(TOTP).toContain("step <= user.totpLastUsedStep");
    expect(TOTP).toMatch(/totpLastUsedStep: \{ lt: step \}/);
  });

  it("share the lockout with the password and the face", () => {
    expect(TOTP).toContain("registerFailedAttempt(user)");
    expect(TOTP.indexOf("consumeAttempt(clientKey)")).toBeLessThan(TOTP.indexOf("verifyTotp("));
  });

  it("never replace a live authenticator from the sign-in page", () => {
    // Otherwise the password alone would be enough to swap the owner's phone
    // for somebody else's. The rule lives in totpSetupPending, which also
    // lets a forgotten request lapse.
    expect(SETUP).toContain("!totpSetupPending(user)");
    expect(SETUP.indexOf("totpSetupPending(user)")).toBeLessThan(
      SETUP.indexOf("generateTotpSecret()")
    );
  });

  /**
   * The bypass. A pending request plus the password used to be enough to
   * bind a new phone to a face-enrolled account and sign in with it; the face
   * was never asked for. Both doors now check for a challenge the face step
   * marked, and the face step is the only thing that can mark one.
   */
  it("ask a face account for the face before binding a phone to it", () => {
    for (const source of [SETUP, TOTP]) {
      expect(source).toContain("user.faceEnrollments.length > 0 && !challenge.faceVerified");
    }
    expect(FACE).toContain("signFaceChallenge(user.id, { faceVerified: true })");
    // The face route hands over instead of signing in when a setup is waiting.
    expect(FACE.indexOf("return await issueSessionResponse(user,")).toBeGreaterThan(-1);
    expect(FACE.indexOf("totpSetupPending(user)")).toBeLessThan(
      FACE.indexOf("return await issueSessionResponse(user,")
    );
  });

  it("spend the challenge the setup arrived with before handing out a new one", () => {
    // Otherwise every call minted two more minutes from the same password
    // proof, indefinitely.
    expect(SETUP.indexOf("claimNonce(challenge.nonce)")).toBeLessThan(
      SETUP.indexOf("signFaceChallenge(user.id")
    );
  });

  /**
   * The counter used to be cleared the moment the password matched -- before
   * any second factor -- so five wrong codes, a fresh sign-in, five more,
   * and the lock never came. It is cleared only where a session is issued.
   */
  it("keep the lockout counting through the second factor", () => {
    expect(LOGIN.indexOf("clearFailedAttempts(user)")).toBeGreaterThan(
      LOGIN.indexOf("mfaRequired: true")
    );
    expect(LOGIN.indexOf("clearFailedAttempts(user)")).toBeLessThan(
      LOGIN.indexOf("issueSessionResponse(user")
    );
  });

  it("store the secret sealed, and never send it to the Users page", () => {
    expect(SETUP).toContain("totpSecret: sealSecret(secret)");
    expect(USER_SELECT).not.toContain("totpSecret");
  });
});
