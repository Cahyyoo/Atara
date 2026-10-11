import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { changePasswordSchema, rolePasswordSchema } from "@/lib/validation";
import { endSessionById, endUserSessions } from "@/lib/user-session";
import { loadSession } from "@/lib/session-user";
import { prisma } from "@/lib/prisma";

/**
 * Changing one's own password, and an administrator ending sessions: both end
 * other devices' sessions for a reason those devices are then told.
 */

describe("changePasswordSchema", () => {
  it("accepts a new password of eight or more characters", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old-pass", newPassword: "new-pass1" }).success
    ).toBe(true);
  });

  it("refuses a short new password, with the same rule an admin is held to", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old-pass", newPassword: "short" }).success
    ).toBe(false);
    expect(rolePasswordSchema.safeParse({ role: "OPERATOR", department: "LAB" as const, password: "short" }).success).toBe(false);
  });

  it("refuses a new password that is the current one", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "same-pass",
      newPassword: "same-pass",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["newPassword"]);
  });

  it("refuses an absurdly long one before bcrypt sees it", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "a".repeat(129) }).success
    ).toBe(false);
  });
});

describe("where it is enforced", () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), "src", ...parts), "utf8");

  it("checks the current password, keeps this device, and ends the others", () => {
    const route = read("app", "api", "auth", "password", "route.ts");
    expect(route).toContain("requireSession(request, { allowPasswordChange: true })");
    expect(route).toContain("bcrypt.compare(body.currentPassword");
    expect(route).toContain('endUserSessions(session.userId, "PASSWORD_CHANGED"');
    expect(route).toContain("exceptSessionId: session.sessionId");
    expect(route).toContain("SignInOutcome.PASSWORD_CHANGED");
    // A 401 would read as "signed out" to the phone; the session is fine.
    expect(route).not.toContain(", 401");
  });

  it("signs a user out everywhere when an admin resets their password", () => {
    expect(read("app", "api", "users", "[id]", "reset-password", "route.ts")).toContain(
      'endUserSessions(id, "ADMIN_ENDED"'
    );
  });

  it("keeps the session list and its actions to user managers", () => {
    for (const parts of [
      ["app", "api", "users", "[id]", "sessions", "route.ts"],
      ["app", "api", "users", "[id]", "sessions", "[sessionId]", "route.ts"],
    ]) {
      expect(read(...parts), parts.join("/")).toContain(
        'requireCapability(request, "manageUsers")'
      );
    }
  });

  it("tells an ended device why, on the web and in the API", () => {
    expect(read("lib", "api-auth.ts")).toContain("sessionEndedError(state)");
    expect(read("components", "layout", "session-watch.tsx")).toContain("SESSION_ENDED_CODE");
    expect(read("lib", "page-auth.ts")).toContain("SIGN_IN_REASON[state.reason]");
  });
});

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[session-management] skipped: no database reachable");
}

describe.skipIf(!reachable)("ending sessions (database)", () => {
  const email = `session-management-${Date.now()}@test.invalid`;
  let userId = "";

  async function openSession(client: "WEB" | "MOBILE") {
    const session = await prisma.userSession.create({ data: { userId, client } });
    return session.id;
  }

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("ends every other session, keeps the one asking, and says why", async () => {
    const user = await prisma.user.create({
      data: { name: "Session test", email, password: "x", role: "OPERATOR", department: "LAB" as const },
    });
    userId = user.id;
    const here = await openSession("WEB");
    const phone = await openSession("MOBILE");

    expect(await endUserSessions(userId, "PASSWORD_CHANGED", { exceptSessionId: here })).toBe(1);

    expect(await loadSession(here, userId)).toEqual({ status: "active", role: "OPERATOR", department: "LAB" as const, mustChangePassword: false });
    expect(await loadSession(phone, userId)).toMatchObject({
      status: "ended",
      reason: "PASSWORD_CHANGED",
    });
  });

  it("ends one session by id, once", async () => {
    const web = await openSession("WEB");

    expect(await endSessionById(web, userId, "ADMIN_ENDED")).toBe(true);
    expect(await endSessionById(web, userId, "ADMIN_ENDED")).toBe(false);
    expect(await loadSession(web, userId)).toMatchObject({ status: "ended", reason: "ADMIN_ENDED" });
  });

  it("will not end a session through somebody else's account", async () => {
    const web = await openSession("WEB");
    expect(await endSessionById(web, "someone-else", "ADMIN_ENDED")).toBe(false);
    expect(await loadSession(web, userId)).toMatchObject({ status: "active" });
  });
});
