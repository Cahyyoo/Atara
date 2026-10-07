import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { NO_ROLE_DEFAULT_CODE, ROLE_DEFAULT_PASSWORD_CODE } from "@/lib/session-codes";

/**
 * Role default passwords, and the duty to change a password that comes with
 * them: a new account starts on its role's default, a forgotten password is
 * reset to it, and either way its owner replaces it -- with one that is not
 * the default -- before anything else. Against the real database; skipped
 * when there is none.
 *
 * The defaults are one row per role, shared with whoever uses this database,
 * so the ones found are put back afterwards.
 */

const session = { userId: "", name: "Admin", email: "", role: "ADMIN" as const, sessionId: "" };
vi.mock("@/lib/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const { POST: createUser } = await import("@/app/api/users/route");
const { PATCH: updateUser } = await import("@/app/api/users/[id]/route");
const { POST: resetPassword } = await import("@/app/api/users/[id]/reset-password/route");
const { GET: listDefaults, PUT: setDefault } = await import("@/app/api/admin/role-passwords/route");
const { POST: changePassword } = await import("@/app/api/auth/password/route");

function json(url: string, method: string, body?: unknown) {
  if (body === undefined) return new NextRequest(`http://localhost${url}`, { method });
  const text = JSON.stringify(body);
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: text,
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
  });
}

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[force-password-routes] skipped: no database reachable");
}

const DEFAULT = "OperatorDefault1!";

describe.skipIf(!reachable)("role default passwords and the duty to change them", () => {
  const tag = `fr${Date.now().toString(36)}`;
  const created: string[] = [];
  let saved: { role: "ADMIN" | "DATABASE" | "ANALISIS" | "OPERATOR"; passwordHash: string; updatedById: string | null }[] = [];

  beforeAll(async () => {
    saved = await prisma.rolePasswordDefault.findMany({
      select: { role: true, passwordHash: true, updatedById: true },
    });
    const admin = await prisma.user.create({
      data: { name: "Admin", email: `${tag}-admin@test.invalid`, password: await bcrypt.hash("Admin123!", 4), role: "ADMIN" },
    });
    created.push(admin.id);
    const own = await prisma.userSession.create({ data: { userId: admin.id, client: "WEB" } });
    Object.assign(session, { userId: admin.id, email: admin.email, sessionId: own.id });
  });

  afterAll(async () => {
    // Back to the defaults this database had before.
    await prisma.rolePasswordDefault.deleteMany({});
    if (saved.length > 0) await prisma.rolePasswordDefault.createMany({ data: saved });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
  });

  it("sets a role's default, and never hands it back", async () => {
    const response = await setDefault(json("/api/admin/role-passwords", "PUT", { role: "OPERATOR", password: DEFAULT }));
    expect(response.status).toBe(200);

    const listed = await (await listDefaults(json("/api/admin/role-passwords", "GET"))).text();
    expect(listed).not.toContain(DEFAULT);
    expect(listed).not.toContain("$2");
    const body = JSON.parse(listed);
    expect(body.data).toHaveLength(4);
    expect(body.data.find((entry: { role: string }) => entry.role === "OPERATOR")).toMatchObject({
      isSet: true,
      updatedBy: "Admin",
    });

    const short = await setDefault(json("/api/admin/role-passwords", "PUT", { role: "OPERATOR", password: "short" }));
    expect(short.status).toBe(422);
  });

  it("starts a new account on its role's default, which it must change", async () => {
    const response = await createUser(
      json("/api/users", "POST", { name: "New person", email: `${tag}-new@test.invalid`, role: "OPERATOR" })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    created.push(body.data.id);
    expect(body.data.mustChangePassword).toBe(true);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(await bcrypt.compare(DEFAULT, stored.password)).toBe(true);
  });

  it("refuses an account for a role without a default", async () => {
    await prisma.rolePasswordDefault.deleteMany({ where: { role: "DATABASE" } });
    const response = await createUser(
      json("/api/users", "POST", { name: "No default", email: `${tag}-none@test.invalid`, role: "DATABASE" })
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(NO_ROLE_DEFAULT_CODE);
  });

  it("resets a forgotten password to the default and signs every device out", async () => {
    const other = await prisma.user.create({
      data: {
        name: "Other",
        email: `${tag}-other@test.invalid`,
        password: await bcrypt.hash("Mine1234!", 4),
        role: "OPERATOR",
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    created.push(other.id);
    const device = await prisma.userSession.create({ data: { userId: other.id, client: "MOBILE" } });

    // Editing the account cannot set a password any more.
    await updateUser(json(`/api/users/${other.id}`, "PATCH", { name: "Other", password: "Typed1234!" }), {
      params: Promise.resolve({ id: other.id }),
    });
    expect(await bcrypt.compare("Mine1234!", (await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).password)).toBe(true);

    const response = await resetPassword(json(`/api/users/${other.id}/reset-password`, "POST"), {
      params: Promise.resolve({ id: other.id }),
    });
    expect(response.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(await bcrypt.compare(DEFAULT, after.password)).toBe(true);
    expect(after).toMatchObject({ mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null });
    expect((await prisma.userSession.findUniqueOrThrow({ where: { id: device.id } })).endedReason).toBe("ADMIN_ENDED");
  });

  it("does not reset an administrator's own password", async () => {
    const response = await resetPassword(json(`/api/users/${session.userId}/reset-password`, "POST"), {
      params: Promise.resolve({ id: session.userId }),
    });
    expect(response.status).toBe(400);
  });

  it("clears the duty once the person picks a password of their own -- not the default", async () => {
    const person = await prisma.user.create({
      data: {
        name: "Person",
        email: `${tag}-person@test.invalid`,
        password: await bcrypt.hash("Given1234!", 4),
        role: "OPERATOR",
        mustChangePassword: true,
      },
    });
    created.push(person.id);
    const own = await prisma.userSession.create({ data: { userId: person.id, client: "WEB" } });
    Object.assign(session, { userId: person.id, email: person.email, sessionId: own.id });

    const wrong = await changePassword(json("/api/auth/password", "POST", { currentPassword: "nope", newPassword: "MyOwn1234!" }));
    expect(wrong.status).toBe(400);

    const shared = await changePassword(
      json("/api/auth/password", "POST", { currentPassword: "Given1234!", newPassword: DEFAULT })
    );
    expect(shared.status).toBe(400);
    expect((await shared.json()).code).toBe(ROLE_DEFAULT_PASSWORD_CODE);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).mustChangePassword).toBe(true);

    const right = await changePassword(
      json("/api/auth/password", "POST", { currentPassword: "Given1234!", newPassword: "MyOwn1234!" })
    );
    expect(right.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).mustChangePassword).toBe(false);
  });
});
