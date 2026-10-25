import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/core/lib/prisma";
import { CRM_COLUMNS, CRM_KINDS, crmKeyFields } from "@/modules/eksplorasi/lib/crm-list-columns";
import { crmRowChangeSchema, crmRowSchema } from "@/modules/eksplorasi/validation";

/**
 * The CRM List against the real database: each of the three tables added
 * to, read, changed and emptied through its routes; a name used twice is a
 * 409, a row that is gone a 404, and an unknown table a 404. Skipped when
 * there is no database.
 */

const session = {
  userId: "",
  name: "CRM list test",
  email: "",
  role: "ADMIN" as const,
  department: "EKSPLORASI" as const,
  sessionId: "test",
};
vi.mock("@/core/lib/http/api-auth", () => ({
  requireCapability: vi.fn(async () => session),
  requireSession: vi.fn(async () => session),
}));

const list = await import("@/app/api/(eksplorasi)/crm-list/[kind]/route");
const one = await import("@/app/api/(eksplorasi)/crm-list/[kind]/[id]/route");

const reachable = await prisma.user
  .count()
  .then(() => true)
  .catch(() => false);

if (!reachable) {
  console.warn("[crm-list-db] skipped: no database reachable");
}

const request = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/crm-list", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function call<P>(
  handler: (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>,
  params: P,
  method: string,
  body?: unknown
) {
  const response = await handler(request(method, body), { params: Promise.resolve(params) });
  return { status: response.status, body: await response.json() };
}

describe("a CRM row's input", () => {
  it("requires what names the row, and nothing else", () => {
    expect(crmRowSchema("standard").safeParse({ standard: "Oreas182" }).success).toBe(false);
    expect(crmRowSchema("standard").safeParse({ standard: "Oreas182", testMethod: "Fusion XRF" }).success).toBe(true);
    expect(crmRowSchema("blank").safeParse({ label: "  " }).success).toBe(false);
    expect(crmRowSchema("duplicate").safeParse({ label: "Preferred Value", rpd: "<=10%" }).success).toBe(true);
  });

  it("keeps a change to the fields sent, and a name, if sent, still not blank", () => {
    expect(crmRowChangeSchema("blank").safeParse({ ni: "0.02" }).success).toBe(true);
    expect(crmRowChangeSchema("blank").safeParse({ label: "" }).success).toBe(false);
  });

  it("names every table's row by its key columns", () => {
    expect(crmKeyFields("standard")).toEqual(["standard", "testMethod"]);
    expect(crmKeyFields("blank")).toEqual(["label"]);
    expect(crmKeyFields("duplicate")).toEqual(["label"]);
    expect(CRM_COLUMNS.standard).toHaveLength(16);
  });
});

describe.skipIf(!reachable)("the CRM List tables", () => {
  const tag = `CRM${Date.now().toString(36).toUpperCase()}`;

  /** A new row for each table, named with this run's tag so it cannot meet real data. */
  const ROWS = {
    standard: { standard: `${tag}-OREAS`, testMethod: "Fusion XRF", ni: "0.71", sdNi: "0.0080" },
    blank: { label: `${tag}-BLANK`, ni: "0.01", fe2o3: "10" },
    duplicate: { label: `${tag}-DUP`, r2: "0.9", rpd: "<=10%", overRpd: "10%" },
  } as const;

  /** A value change for each table, and the field it lands on. */
  const CHANGES = {
    standard: { ni: "0.72", sdNi: "" },
    blank: { ni: "0.02" },
    duplicate: { rpd: "<=12%" },
  } as const;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: "CRM list test",
        email: `${tag.toLowerCase()}@test.invalid`,
        password: "x",
        role: "ADMIN",
        department: "EKSPLORASI",
      },
    });
    session.userId = user.id;
  });

  afterAll(async () => {
    await prisma.crmStandard.deleteMany({ where: { standard: { startsWith: tag } } });
    await prisma.crmBlank.deleteMany({ where: { label: { startsWith: tag } } });
    await prisma.crmDuplicate.deleteMany({ where: { label: { startsWith: tag } } });
    if (session.userId) await prisma.user.delete({ where: { id: session.userId } });
  });

  for (const kind of CRM_KINDS) {
    it(`adds, lists, changes and deletes a ${kind} row`, async () => {
      const created = await call(list.POST, { kind }, "POST", ROWS[kind]);
      expect(created.status).toBe(201);
      const id: string = created.body.data.id;
      expect(created.body.data).toMatchObject(ROWS[kind]);

      // The same name again is refused, not added twice.
      const twice = await call(list.POST, { kind }, "POST", ROWS[kind]);
      expect(twice.status).toBe(409);

      const listed = await call(list.GET, { kind }, "GET");
      expect(listed.status).toBe(200);
      expect(listed.body.data.map((row: { id: string }) => row.id)).toContain(id);

      const changed = await call(one.PATCH, { kind, id }, "PATCH", CHANGES[kind]);
      expect(changed.status).toBe(200);
      for (const [field, value] of Object.entries(CHANGES[kind])) {
        // A blank box clears the value; it is not stored as "".
        expect(changed.body.data[field]).toBe(value === "" ? null : value);
      }
      // What was not sent stays as it was.
      const [keyField] = crmKeyFields(kind);
      expect(changed.body.data[keyField]).toBe(ROWS[kind][keyField as keyof (typeof ROWS)[typeof kind]]);

      const removed = await call(one.DELETE, { kind, id }, "DELETE");
      expect(removed.status).toBe(200);
      const gone = await call(one.PATCH, { kind, id }, "PATCH", CHANGES[kind]);
      expect(gone.status).toBe(404);
    });
  }

  it("refuses a table that does not exist", async () => {
    expect((await call(list.GET, { kind: "nonsense" }, "GET")).status).toBe(404);
    expect((await call(list.POST, { kind: "nonsense" }, "POST", { label: "x" })).status).toBe(404);
  });

  it("refuses a row without its name", async () => {
    const missing = await call(list.POST, { kind: "standard" }, "POST", { standard: `${tag}-NOMETHOD` });
    expect(missing.status).toBe(422);
  });
});
