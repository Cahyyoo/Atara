import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { signSessionToken } from "@/core/lib/auth/auth";
import { invalidateAnnouncements } from "@/modules/system/lib/announcements";
import type { Role } from "@/core/lib/auth/permissions";

/**
 * The banner the phone reads. The administrator's list next door is every
 * announcement ever written; this one is what the caller should see now, so
 * every signed-in account may ask -- and sees only what is aimed at them.
 * Against the real database; skipped when there is none.
 */

const reachable = await prisma.user.count().then(() => true).catch(() => false);
if (!reachable) console.warn("[announcements-active] skipped: no database");

const { GET } = await import("@/app/api/(system)/announcements/active/route");

describe.skipIf(!reachable)("GET /api/announcements/active", () => {
  const tag = `AN${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = { users: [] as string[], announcements: [] as string[] };
  const ids: Record<string, string> = {};

  async function actor(role: Role) {
    const department = role === "SUPER_ADMIN" ? null : ("LAB" as const);
    const user = await prisma.user.create({
      data: { name: `${tag} ${role}`, email: `${tag.toLowerCase()}-${role.toLowerCase()}@test.invalid`, password: "x", role, department },
    });
    created.users.push(user.id);
    const session = await prisma.userSession.create({ data: { userId: user.id, client: "MOBILE" } });
    return signSessionToken({ userId: user.id, name: user.name, email: user.email, role, department, sessionId: session.id });
  }

  function request(token?: string) {
    return new NextRequest("http://localhost/api/announcements/active", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  async function messagesFor(token: string): Promise<string[]> {
    const response = await GET(request(token));
    expect(response.status).toBe(200);
    const body = await response.json();
    return body.data.announcements
      .filter((entry: { message: string }) => entry.message.startsWith(tag))
      .map((entry: { message: string }) => entry.message);
  }

  beforeAll(async () => {
    const author = await prisma.user.create({
      data: { name: `${tag} Author`, email: `${tag.toLowerCase()}-author@test.invalid`, password: "x", role: "ADMIN", department: "LAB" as const },
    });
    created.users.push(author.id);

    const make = async (message: string, data: object) => {
      const row = await prisma.announcement.create({
        data: { message: `${tag} ${message}`, createdById: author.id, ...data },
      });
      created.announcements.push(row.id);
      ids[message] = row.id;
    };
    await make("everyone", {});
    await make("operators", { roles: ["PREPARATOR"] });
    await make("analysts", { roles: ["ANALISIS"] });
    await make("ended", { endsAt: new Date("2000-01-01T00:00:00Z") });
    invalidateAnnouncements();
  });

  afterAll(async () => {
    await prisma.announcement.deleteMany({ where: { id: { in: created.announcements } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    invalidateAnnouncements();
  });

  it("gives an operator what is aimed at them, and nothing meant for another role", async () => {
    const messages = await messagesFor(await actor("PREPARATOR"));
    expect(messages).toContain(`${tag} everyone`);
    expect(messages).toContain(`${tag} operators`);
    expect(messages).not.toContain(`${tag} analysts`);
    // One whose run is over is not news to anybody.
    expect(messages).not.toContain(`${tag} ended`);
  });

  it("aims the same route at each role separately", async () => {
    const messages = await messagesFor(await actor("ANALISIS"));
    expect(messages).toContain(`${tag} analysts`);
    expect(messages).not.toContain(`${tag} operators`);
  });

  it("refuses a caller with no session", async () => {
    expect((await GET(request())).status).toBe(401);
  });
});
