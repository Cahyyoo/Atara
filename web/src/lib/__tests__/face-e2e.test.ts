import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { euclideanDistance, MATCH_THRESHOLD, DESCRIPTOR_LENGTH } from "@/lib/face-match";

/**
 * The whole chain, end to end, without a camera.
 *
 * Every other test here proves one link: face-reading.test.ts judges numbers,
 * the Python suite runs dlib, face-capture-cost.test.ts reads source. None of
 * them can tell you that a browser posting frames to Next.js reaches dlib and
 * gets an answer back -- which is exactly the kind of thing that breaks on a
 * renamed field, a missing environment variable, or a token that stopped
 * matching, and breaks silently.
 *
 * The trick that makes it possible: enrolment cannot be automated (five
 * jittered copies of one photograph are refused as "too similar" -- measured,
 * three of five land under DISTINCT_ENOUGH_DISTANCE), and sign-in needs a
 * blink that a still photograph cannot fake. But
 *
 *     a burst of stills that comes back "not-alive" has proved everything
 *     except the blink.
 *
 * Detection ran, the quality gate passed, dlib computed a descriptor, and the
 * policy was applied to it. A "no-face" there instead would mean the chain
 * broke somewhere nameable. So the refusal code is the instrument, not the
 * sign-in.
 *
 * Skips rather than fails when the stack is not up. A test that cannot run is
 * not a test that passed, so the skip reasons are specific.
 */

const WEB = process.env.FACE_E2E_WEB ?? "http://127.0.0.1:3000";
const SERVICE = process.env.FACE_E2E_SERVICE ?? "http://127.0.0.1:8001";

/**
 * Webcam-framed crops of dlib's sample photographs, built by
 * face/scripts/make_fixtures.py. Fetched and generated, never committed: they
 * are somebody's face.
 *
 * Not the originals. In those the face is 21% of the frame width and the
 * application is right to refuse it as "too far away" -- testing against a
 * frame the product would reject proves nothing. These are cropped to 34%,
 * which is roughly where somebody sitting at a laptop lands.
 */
const FIXTURES = join(process.cwd(), "..", "face", "tests", "fixtures");
const ONE_PERSON = "headshot-a.jpg";
const ANOTHER_PERSON = "headshot-b.jpg";

const ADMIN = { email: "admin@atara.local", password: "Admin123!" };

/**
 * Four, not the browser's twelve.
 *
 * Enough for the service to report a burst and for the blink rule to run over
 * more than one frame. The frames are identical, so more of them would only
 * make the upload bigger and prove the same thing.
 */
const BURST_SIZE = 4;

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name)).toString("base64");
}

function burst(name: string, size = BURST_SIZE): string[] {
  return Array.from({ length: size }, () => fixture(name));
}

/**
 * Answering at all, which is not the same as answering yes.
 *
 * /api/auth/me replies 401 without a session, and that is a server that is up.
 * Requiring response.ok here would have reported the whole stack as down and
 * skipped every test below with a reason that was not true.
 */
async function responds(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

/** The service, which must be healthy rather than merely listening. */
async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

/**
 * One value from .env, because vitest does not load it.
 *
 * The signing secret and the database address are needed only to mint the
 * admin session the enrolment route requires -- a token, and the session row
 * it names. Read here rather than by loading the whole file into process.env:
 * this suite has no business changing what any other test sees.
 */
function envValue(name: string): string | null {
  try {
    const line = readFileSync(join(process.cwd(), ".env"), "utf8")
      .split("\n")
      .find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^"|"$/g, "") : null;
  } catch {
    return null;
  }
}

const secret = envValue("JWT_SECRET");
const haveFixtures = existsSync(join(FIXTURES, ONE_PERSON));
const webUp = await responds(`${WEB}/api/auth/me`);
const serviceUp = await healthy(`${SERVICE}/health`);

const why = !secret
  ? "JWT_SECRET is not in web/.env, so no admin session can be signed"
  : !haveFixtures
  ? `sample photographs are missing: run python scripts/make_fixtures.py in face/`
  : !webUp
    ? `nothing answering at ${WEB}`
    : !serviceUp
      ? `nothing answering at ${SERVICE}`
      : null;

if (why) {
  // Printed once, because a silently skipped integration test reads exactly
  // like a passing one in the summary line.
  console.warn(`[face-e2e] skipped: ${why}`);
}

describe.skipIf(why !== null)("the face chain, browser to dlib and back", () => {
  let cookie = "";
  let prisma: import("@prisma/client").PrismaClient | undefined;
  let sessionId: string | undefined;

  beforeAll(async () => {
    /**
     * The password door, then a session minted from what it hands back.
     *
     * The first version of this signed in with the password and used the
     * cookie. That stopped working the moment somebody enrolled the admin's
     * face -- which is the whole point of the feature -- because the password
     * step then correctly withholds the cookie and returns a challenge
     * instead. A test that only runs while the feature is unused is not
     * a test.
     *
     * So the password is still checked, the account id is taken from the
     * challenge it returns, and the session is signed with the application's
     * own signer. The face chain below is what is under test; the cookie is
     * scaffolding, and minting it with the real function means it cannot
     * drift from what the routes accept.
     */
    const response = await fetch(`${WEB}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    const result = await response.json();
    expect(response.ok, `sign-in failed: ${JSON.stringify(result)}`).toBe(true);

    let userId: string;
    if (result.data.mfaRequired) {
      // The challenge is a signed JWT; its payload names the account. Read,
      // not verified -- the server already verified the password that
      // produced it.
      const payload = JSON.parse(
        Buffer.from(result.data.challenge.split(".")[1], "base64").toString()
      );
      userId = payload.userId;
    } else {
      const payload = JSON.parse(
        Buffer.from(result.data.token.split(".")[1], "base64").toString()
      );
      userId = payload.userId;
    }
    expect(userId, "no account id came back from the password step").toBeTruthy();

    process.env.JWT_SECRET = secret!;
    const { signSessionToken, SESSION_COOKIE_NAME } = await import("@/lib/auth");

    /**
     * A token is only good while the session row it names has not ended, so
     * the row has to exist. Created directly rather than through a sign-in:
     * a sign-in would end the admin's real browser session, and this suite
     * must not sign anybody out. Ended again in afterAll, so it never shows
     * up as "signed in elsewhere" at the next real sign-in.
     */
    process.env.DATABASE_URL ??= envValue("DATABASE_URL") ?? undefined;
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const session = await prisma.userSession.create({
      data: { userId, client: "WEB", device: "Test end-to-end" },
      select: { id: true },
    });
    sessionId = session.id;

    const token = await signSessionToken({
      userId,
      name: "Main Admin",
      email: ADMIN.email,
      role: "ADMIN",
      sessionId,
    });
    cookie = `${SESSION_COOKIE_NAME}=${token}`;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (sessionId) {
      await prisma.userSession.updateMany({
        where: { id: sessionId, endedAt: null },
        data: { endedAt: new Date(), endedReason: "LOGOUT" },
      });
    }
    await prisma.$disconnect();
  });

  async function readReading(name: string, size = BURST_SIZE) {
    const response = await fetch(`${WEB}/api/face/reading`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ frames: burst(name, size), videoWidth: 640, videoHeight: 480 }),
    });
    return { response, body: await response.json() };
  }

  describe("a reading", () => {
    it("comes back as a descriptor of the length the matcher expects", async () => {
      const { response, body } = await readReading(ONE_PERSON);

      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.data.descriptor).toHaveLength(DESCRIPTOR_LENGTH);
    });

    it("carries the measurements that explain it", async () => {
      // The line somebody reads back when it goes wrong. Empty diagnostics
      // would still render, which is how they would rot unnoticed.
      const { body } = await readReading(ONE_PERSON);
      const diagnostics = body.data.diagnostics;

      expect(diagnostics.frames).toBe(BURST_SIZE);
      expect(diagnostics.framesWithDetection).toBe(BURST_SIZE);
      expect(diagnostics.bestScore).toBeGreaterThan(0);
      expect(diagnostics.videoWidth).toBe(640);
    });

    it("says nobody is there rather than inventing somebody", async () => {
      // A 1x1 JPEG: valid image, no face. The service must answer, not error.
      const blank =
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
        "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
        "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
      const response = await fetch(`${WEB}/api/face/reading`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ frames: [blank] }),
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe("no-face");
    });
  });

  describe("the descriptor, measured through the real route", () => {
    /**
     * The two tests that would let somebody into the wrong account.
     *
     * The Python suite already checks this against the engine directly. Here
     * it goes the whole way -- JPEG to base64 to HTTP to dlib and back -- so a
     * transport that quietly corrupted a float would be caught rather than
     * showing up months later as one person signing in as another.
     */
    it("puts the same face within the matching threshold of itself", async () => {
      const a = (await readReading(ONE_PERSON)).body.data.descriptor;
      const b = (await readReading(ONE_PERSON)).body.data.descriptor;

      expect(
        euclideanDistance(Float32Array.from(a), Float32Array.from(b))
      ).toBeLessThan(MATCH_THRESHOLD);
    });

    it("puts two different people outside it", async () => {
      const a = (await readReading(ONE_PERSON)).body.data.descriptor;
      const b = (await readReading(ANOTHER_PERSON)).body.data.descriptor;

      expect(
        euclideanDistance(Float32Array.from(a), Float32Array.from(b))
      ).toBeGreaterThan(MATCH_THRESHOLD);
    });
  });

  describe("who may ask", () => {
    it("refuses a reading with no session", async () => {
      const response = await fetch(`${WEB}/api/face/reading`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: burst(ONE_PERSON, 1) }),
      });

      // 401 and not 500: an unauthenticated caller is a refusal, not a fault.
      expect(response.status).toBe(401);
    });

    it("refuses a preview with neither a session nor a challenge", async () => {
      const response = await fetch(`${WEB}/api/face/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame: fixture(ONE_PERSON) }),
      });

      // Otherwise this is an open face detector on the internet.
      expect(response.status).toBe(401);
    });
  });

  describe("the live guide", () => {
    it("reports where the face is without handing back a descriptor", async () => {
      const response = await fetch(`${WEB}/api/face/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ frame: fixture(ONE_PERSON) }),
      });
      const body = await response.json();

      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(body.data.detected).toBe(true);
      // Nothing about the face comes back: no box, no landmarks, no
      // descriptor. A caller polling this learns where to stand, and nothing
      // else.
      expect(body.data).not.toHaveProperty("descriptor");
      expect(body.data).not.toHaveProperty("box");
    });
  });
});

/**
 * The sign-in leg.
 *
 * Separate because it needs an account with a face enrolled: the password step
 * only issues a challenge for one, and there is nothing to enrol from here.
 * Until somebody has stood in front of the camera, this skips -- and says so,
 * so that a skip is not mistaken for a pass.
 */
const enrolled = await (async () => {
  if (why) return false;
  const response = await fetch(`${WEB}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN),
  }).catch(() => null);
  if (!response?.ok) return false;
  const result = await response.json();
  return result?.data?.faceRequired === true;
})().catch(() => false);

if (!why && !enrolled) {
  console.warn(
    "[face-e2e] sign-in leg skipped: no face is enrolled on the admin account yet. " +
      "Enrol one through the Users module and this runs."
  );
}

describe.skipIf(!!why || !enrolled)("signing in with a burst", () => {
  async function challenge(): Promise<string> {
    const response = await fetch(`${WEB}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ADMIN),
    });
    return (await response.json()).data.challenge;
  }

  it("gets as far as the blink, which proves everything before it", async () => {
    const response = await fetch(`${WEB}/api/auth/face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge: await challenge(),
        frames: burst(ONE_PERSON),
        videoWidth: 640,
        videoHeight: 480,
      }),
    });
    const body = await response.json();

    /**
     * "not-alive" is the pass condition here, and that is not a trick.
     *
     * These are still photographs, so there is no blink to find and refusing
     * them is correct. Reaching that refusal means the frames were decoded,
     * dlib found a face in them, the quality gate let them through and a
     * descriptor was computed -- the entire chain except the one thing a
     * photograph cannot do.
     *
     * "no-face" would mean it broke, and where.
     */
    expect(body.code, `expected the chain to reach the blink check, got: ${JSON.stringify(body)}`)
      .toBe("not-alive");
    expect(response.status).toBe(400);
  });

  it("never issues a session on a burst it refused", async () => {
    const response = await fetch(`${WEB}/api/auth/face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: await challenge(), frames: burst(ONE_PERSON) }),
    });

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not spend the challenge on a burst it refused", async () => {
    /**
     * The change that makes a self-firing camera workable.
     *
     * The nonce used to be claimed the moment a request arrived, so a missed
     * blink -- a routine event now that nobody presses anything -- cost
     * somebody their challenge and sent them back to the password field. It
     * is claimed immediately before the comparison instead, so a refusal that
     * proved nothing costs nothing.
     *
     * The other half of that property, that a challenge is still spent before
     * any face is compared, cannot be reached from here: it needs a burst that
     * passes the blink check, and these are photographs. It is pinned against
     * the source in sign-in-audit.test.ts.
     */
    const one = await challenge();
    const post = () =>
      fetch(`${WEB}/api/auth/face`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: one, frames: burst(ONE_PERSON) }),
      });

    // Refused for the reading, not for the challenge: 400, not 401.
    expect((await post()).status).toBe(400);
    expect((await post()).status).toBe(400);
  });
});
