import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import enMessages from "../../../messages/en.json";

/**
 * The record that makes the face step worth having.
 *
 * A session cookie proves somebody held a password. Only the audit says
 * whether a face was checked as well, and that is the difference between
 * "this account did it" and "this person did it". None of it is a type error
 * or a crash if it goes missing: sign-in keeps working perfectly, and the
 * trail is simply empty.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

const LOGIN = read("app", "api", "auth", "login", "route.ts");
const FACE = read("app", "api", "auth", "face", "route.ts");
const TOTP = read("app", "api", "auth", "totp", "route.ts");
const AUDIT = read("lib", "sign-in-audit.ts");
const SCHEMA = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

describe("every way a sign-in can end", () => {
  /**
   * Each outcome is recorded somewhere. A value that exists in the enum and
   * is never written is a branch somebody thought about and then did not
   * finish -- which is exactly how the face step came to have no trail at
   * all.
   */
  const OUTCOMES = [
    "PASSWORD_FAILED",
    "ACCOUNT_LOCKED",
    "ACCOUNT_INACTIVE",
    "PASSWORD_ONLY",
    "FACE_UNREADABLE",
    "FACE_MISMATCH",
    "FACE_SERVICE_DOWN",
    "FACE_VERIFIED",
    "TOTP_ENROLLED",
    "TOTP_VERIFIED",
    "TOTP_MISMATCH",
  ];

  it("is declared in the schema", () => {
    for (const outcome of OUTCOMES) {
      expect(SCHEMA).toContain(outcome);
    }
  });

  it("is actually written by one of the sign-in routes", () => {
    const written = LOGIN + FACE + TOTP;
    for (const outcome of OUTCOMES) {
      expect(written, `${outcome} is declared but never recorded`).toContain(
        `SignInOutcome.${outcome}`
      );
    }
  });

  /**
   * Not an attempt of its own: the consequence of one on another device. It
   * is written where every session starts, so every route that finishes a
   * sign-in records it without having to remember to.
   */
  it("records a takeover where sessions start", () => {
    expect(SCHEMA).toContain("SESSION_REPLACED");
    expect(read("lib", "user-session.ts")).toContain("SignInOutcome.SESSION_REPLACED");
  });

  it("puts the password outcomes on the password step", () => {
    for (const outcome of ["PASSWORD_FAILED", "ACCOUNT_INACTIVE", "PASSWORD_ONLY"]) {
      expect(LOGIN).toContain(`SignInOutcome.${outcome}`);
    }
  });

  it("puts the face outcomes on the face step", () => {
    for (const outcome of ["FACE_UNREADABLE", "FACE_MISMATCH", "FACE_VERIFIED"]) {
      expect(FACE).toContain(`SignInOutcome.${outcome}`);
    }
  });

  it("puts the authenticator outcomes on the authenticator step", () => {
    for (const outcome of ["TOTP_ENROLLED", "TOTP_VERIFIED", "TOTP_MISMATCH"]) {
      expect(TOTP).toContain(`SignInOutcome.${outcome}`);
    }
  });

  it("records an outage rather than losing it", () => {
    // The one failure that is nobody's fault but ours, and the one most
    // likely to be dropped: it happens in a catch block, where the account
    // it belongs to is easy to have lost track of.
    expect(FACE).toContain("SignInOutcome.FACE_SERVICE_DOWN");
    expect(FACE).toContain("let userId: string | null = null;");
  });
});

describe("what the audit will not do", () => {
  it("never derives faceVerified from the outcome", () => {
    /**
     * Stored, not computed. A new outcome added later must be given its
     * answer deliberately rather than inheriting one from a condition
     * somebody forgot to update -- and the direction of that mistake is
     * always the same: something that was not verified looking as if it was.
     */
    expect(AUDIT).toContain("VERIFIED_BY_FACE");
    expect(AUDIT).not.toMatch(/faceVerified:\s*outcome\s*===/);
  });

  it("counts only a matched face as verified", () => {
    const set = AUDIT.slice(AUDIT.indexOf("VERIFIED_BY_FACE"), AUDIT.indexOf("export interface"));
    expect(set).toContain("FACE_VERIFIED");
    for (const outcome of ["PASSWORD_ONLY", "FACE_MISMATCH", "FACE_SERVICE_DOWN"]) {
      expect(set).not.toContain(outcome);
    }
  });

  it("counts only an accepted authenticator code as verified by one", () => {
    expect(AUDIT).not.toMatch(/totpVerified:\s*outcome\s*===/);
    const set = AUDIT.slice(AUDIT.indexOf("VERIFIED_BY_TOTP"), AUDIT.indexOf("export interface"));
    expect(set).toContain("TOTP_VERIFIED");
    expect(set).toContain("TOTP_ENROLLED");
    for (const outcome of ["TOTP_MISMATCH", "PASSWORD_ONLY", "FACE_VERIFIED"]) {
      expect(set).not.toContain(outcome);
    }
  });

  it("records an address only where one can be trusted", () => {
    // x-forwarded-for is the caller's to write. A column that quietly
    // records whatever was claimed is worse than one that admits it does
    // not know, so this goes through the helper that returns null unless
    // TRUST_PROXY says a proxy appends it.
    expect(AUDIT).toContain("clientAddressFromHeaders(headers)");
  });

  it("is awaited, not fired and forgotten", () => {
    // An entry that may or may not have been written is not an audit entry.
    expect(AUDIT).toContain("await prisma.signInAudit.create");
  });

  it("stays out of attempts against addresses that match no account", () => {
    // People type passwords into the email field. Recording what was typed
    // would eventually put one in this table in plain text.
    expect(SCHEMA).toContain("userId  String");
    expect(SCHEMA).not.toMatch(/model SignInAudit[\s\S]*?email\s+String/);
  });
});

describe("the challenge, and when it is spent", () => {
  it("is claimed after the refusals that prove nothing", () => {
    /**
     * It used to be claimed on arrival. The camera now fires by itself when
     * the framing is right, so a missed blink is a routine event, and
     * claiming early meant every one of them sent somebody back to the
     * password field.
     *
     * What the nonce is for is stopping a captured challenge being matched
     * twice, so it belongs immediately before the comparison -- and after
     * every refusal that never got that far.
     */
    const claim = FACE.indexOf("claimNonce(challenge.nonce)");
    const match = FACE.indexOf("= matchDescriptor(");
    const unreadable = FACE.indexOf("SignInOutcome.FACE_UNREADABLE");

    // Each has to be a call site, not the import line that shares its name.
    expect(claim).toBeGreaterThan(-1);
    expect(match).toBeGreaterThan(-1);

    expect(unreadable).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(unreadable);
    expect(claim).toBeLessThan(match);
  });

  it("is still spent before any face is compared", () => {
    // The property that must survive the move: one challenge, one comparison.
    expect(FACE.indexOf("claimNonce(challenge.nonce)")).toBeLessThan(
      FACE.indexOf("= matchDescriptor(")
    );
  });

  it("still costs an attempt whatever happens", () => {
    // Guessing at the face step has to cost the same as guessing at the
    // first one, and that limit is what now bounds bursts per challenge.
    expect(FACE.indexOf("consumeAttempt(clientKey)")).toBeLessThan(
      FACE.indexOf("claimNonce(challenge.nonce)")
    );
  });
});

describe("the labels the camera no longer needs", () => {
  it("has no message for a capture button that is gone", () => {
    // Left behind, these would be the only trace of a control nobody can
    // press -- the same way removeFace once was.
    for (const key of ["capture", "cameraFirst", "enrollCapture"]) {
      expect(Object.keys(enMessages.face)).not.toContain(key);
    }
  });

  it("has the ones the countdown needs", () => {
    for (const key of ["autoIn", "autoHold", "autoVerify", "consentGiven", "enrollProgress"]) {
      expect(Object.keys(enMessages.face)).toContain(key);
    }
  });
});
