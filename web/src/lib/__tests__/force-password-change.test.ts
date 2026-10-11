import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSessionToken } from "@/lib/auth";
import { requireSession } from "@/lib/api-auth";
import { loadSession } from "@/lib/session-user";
import { PASSWORD_CHANGE_REQUIRED_CODE } from "@/lib/session-codes";

/**
 * A password an administrator chose is replaced by its owner before anything
 * else, on the web and on the phone alike. Against the real database;
 * skipped when there is none.
 */

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[force-password-change] skipped: no database reachable");
}

describe.skipIf(!reachable)("the password an administrator chose", () => {
  const tag = `fp${Date.now().toString(36)}`;
  let user = { id: "", name: "Force test", email: `${tag}@test.invalid` };

  async function requestFor(client: "WEB" | "MOBILE") {
    const session = await prisma.userSession.create({ data: { userId: user.id, client } });
    const token = await signSessionToken({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: "DATABASE",
      sessionId: session.id,
    });
    return {
      sessionId: session.id,
      request: new NextRequest("http://localhost/api/anything", { headers: { authorization: `Bearer ${token}` } }),
    };
  }

  beforeAll(async () => {
    const created = await prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        password: await bcrypt.hash("Initial123!", 4),
        role: "DATABASE",
        mustChangePassword: true,
      },
    });
    user = { ...user, id: created.id };
  });

  afterAll(async () => {
    if (user.id) await prisma.user.delete({ where: { id: user.id } });
  });

  it("holds every session, the phone's included", async () => {
    const web = await requestFor("WEB");
    const phone = await requestFor("MOBILE");
    expect(await loadSession(web.sessionId, user.id)).toMatchObject({ status: "active", mustChangePassword: true });
    expect(await loadSession(phone.sessionId, user.id)).toMatchObject({ status: "active", mustChangePassword: true });
  });

  it("refuses everything but what changing it takes, on the web and the phone alike", async () => {
    for (const client of ["WEB", "MOBILE"] as const) {
      const session = await requestFor(client);
      await expect(requireSession(session.request), client).rejects.toMatchObject({
        status: 403,
        code: PASSWORD_CHANGE_REQUIRED_CODE,
      });
      await expect(
        requireSession(session.request, { allowPasswordChange: true }),
        client
      ).resolves.toMatchObject({ userId: user.id });
    }
  });

  it("lets everything through once the password is the person's own", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
    const web = await requestFor("WEB");
    await expect(requireSession(web.request)).resolves.toMatchObject({ userId: user.id });
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
  });
});
