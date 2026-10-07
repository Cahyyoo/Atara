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
 * else -- on the web; the phone has no screen for it yet. Against the real
 * database; skipped when there is none.
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

  it("holds a web session, and only a web session", async () => {
    const web = await requestFor("WEB");
    const phone = await requestFor("MOBILE");
    expect(await loadSession(web.sessionId, user.id)).toMatchObject({ status: "active", mustChangePassword: true });
    expect(await loadSession(phone.sessionId, user.id)).toMatchObject({ status: "active", mustChangePassword: false });
  });

  it("refuses everything on the web but what changing it takes", async () => {
    const web = await requestFor("WEB");
    await expect(requireSession(web.request)).rejects.toMatchObject({
      status: 403,
      code: PASSWORD_CHANGE_REQUIRED_CODE,
    });
    await expect(requireSession(web.request, { allowPasswordChange: true })).resolves.toMatchObject({
      userId: user.id,
    });

    // The phone carries on, for now.
    const phone = await requestFor("MOBILE");
    await expect(requireSession(phone.request)).resolves.toMatchObject({ userId: user.id });
  });

  it("lets everything through once the password is the person's own", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
    const web = await requestFor("WEB");
    await expect(requireSession(web.request)).resolves.toMatchObject({ userId: user.id });
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
  });
});
