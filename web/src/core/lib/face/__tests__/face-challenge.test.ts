import { describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET ??= "test-secret-for-face-challenge-tests";

import { signSessionToken, verifySessionToken } from "@/core/lib/auth/auth";
import { signFaceChallenge, verifyFaceChallenge } from "@/core/lib/face/face-challenge";

const USER = {
  userId: "user-1",
  name: "Main Admin",
  email: "admin@atara.local",
  role: "ADMIN" as const, department: "LAB" as const,
  sessionId: "session-1",
};

/**
 * The test this whole feature rests on.
 *
 * Every token here is signed with the same secret, so a valid signature says
 * nothing about which door a token opens. If a challenge token — handed out
 * after the password step and before the face step — can be presented as a
 * session, then the second factor is decorative: the app still shows the
 * camera, the user still sees it work, and it protects nothing.
 *
 * Nothing about that failure is visible from the outside, which is exactly
 * why it is pinned here rather than trusted.
 */
describe("a challenge token is not a session", () => {
  it("is refused as a session token", async () => {
    const challenge = await signFaceChallenge(USER.userId);

    expect(await verifySessionToken(challenge)).toBeNull();
  });

  it("carries none of the session's own claims", async () => {
    // Belt to the purpose check's braces: if the purpose check is ever
    // removed, the shape check still refuses this token. A challenge that
    // gained `name` and `role` "for convenience" would quietly open the hole.
    const challenge = await signFaceChallenge(USER.userId);
    const [, body] = challenge.split(".");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());

    expect(claims.purpose).toBe("face-challenge");
    expect(claims.name).toBeUndefined();
    expect(claims.email).toBeUndefined();
    expect(claims.role).toBeUndefined();
  });
});

describe("a session token is not a challenge", () => {
  it("is refused as a challenge token", async () => {
    // The other direction matters too: a stolen session must not be usable to
    // walk past the face step on someone else's half-finished sign-in.
    const session = await signSessionToken(USER);

    expect(await verifyFaceChallenge(session)).toBeNull();
  });
});

describe("a session token still works as a session", () => {
  it("round-trips, so the purpose claim did not break sign-in", async () => {
    const session = await signSessionToken(USER);

    expect(await verifySessionToken(session)).toEqual(USER);
  });
});

describe("the challenge itself", () => {
  it("round-trips the user it was issued for", async () => {
    const challenge = await signFaceChallenge(USER.userId);
    const verified = await verifyFaceChallenge(challenge);

    expect(verified?.userId).toBe(USER.userId);
    expect(verified?.nonce).toEqual(expect.any(String));
  });

  it("gives every challenge its own nonce", async () => {
    const [first, second] = await Promise.all([
      signFaceChallenge(USER.userId),
      signFaceChallenge(USER.userId),
    ]);

    const a = await verifyFaceChallenge(first);
    const b = await verifyFaceChallenge(second);
    expect(a!.nonce).not.toBe(b!.nonce);
  });

  it("expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-23T08:00:00Z"));
      const challenge = await signFaceChallenge(USER.userId);

      // Still good a minute in.
      vi.setSystemTime(new Date("2026-09-23T08:01:00Z"));
      expect(await verifyFaceChallenge(challenge)).not.toBeNull();

      // Past its two minutes, refused. A token left on a screen over lunch
      // must not still open the door.
      vi.setSystemTime(new Date("2026-09-23T08:05:00Z"));
      expect(await verifyFaceChallenge(challenge)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The claim the authenticator setup trusts. It is set by exactly one caller
   * -- the face route, after a match -- and a challenge that never had it
   * must decode as not having it, or the password step's challenges would
   * open the same door.
   */
  it("is not face-verified unless it was issued that way", async () => {
    const plain = await verifyFaceChallenge(await signFaceChallenge(USER.userId));
    expect(plain?.faceVerified).toBe(false);

    const marked = await verifyFaceChallenge(
      await signFaceChallenge(USER.userId, { faceVerified: true })
    );
    expect(marked?.faceVerified).toBe(true);
  });

  it("leaves the claim off a plain challenge entirely", async () => {
    // Not `false`, absent: a token that never had the claim and one issued
    // without it are the same token.
    const [, body] = (await signFaceChallenge(USER.userId)).split(".");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    expect("faceVerified" in claims).toBe(false);
  });

  it("refuses a token signed with a different secret", async () => {
    // A forged challenge is the obvious attack, and the one the signature is
    // there for.
    const forged =
      "eyJhbGciOiJIUzI1NiJ9." +
      Buffer.from(
        JSON.stringify({ purpose: "face-challenge", userId: "user-1", nonce: "n" })
      ).toString("base64url") +
      ".not-a-real-signature";

    expect(await verifyFaceChallenge(forged)).toBeNull();
  });
});
