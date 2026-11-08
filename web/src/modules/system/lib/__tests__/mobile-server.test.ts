import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/core/lib/http/api-response";
import type { MobileServerCheck } from "@/modules/system/lib/mobile-server-url";

const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  check: vi.fn<() => Promise<MobileServerCheck>>(),
}));

vi.mock("@/core/lib/prisma", () => ({
  prisma: {
    systemSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        db.rows.has(where.key) ? { key: where.key, value: db.rows.get(where.key) } : null
      ),
      upsert: vi.fn(
        async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value?: unknown } }) => {
          if (!db.rows.has(where.key)) db.rows.set(where.key, create.value);
          else if ("value" in update) db.rows.set(where.key, update.value);
          return { key: where.key, value: db.rows.get(where.key) };
        }
      ),
    },
  },
}));

vi.mock("@/modules/system/lib/mobile-server-url", async (actual) => ({
  ...(await actual<typeof import("@/modules/system/lib/mobile-server-url")>()),
  checkMobileServerUrl: db.check,
}));

const NEW_URL = "http://stargate.appinternal.com/atara/api";

/** A fresh module each time: its cache and installation id live at module level. */
async function load() {
  vi.resetModules();
  return import("@/modules/system/lib/mobile-server");
}

/**
 * The refusal, by name: after resetModules the module throws its own copy of
 * ApiError, so instanceof against this file's copy would always fail.
 */
async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toMatchObject({ name: "ApiError" });
  return error as ApiError;
}

describe("setMobileServerUrl", () => {
  beforeEach(() => {
    db.rows.clear();
    db.check.mockReset();
  });

  it("saves an address that answers as this server", async () => {
    db.check.mockResolvedValue("ok");
    const { setMobileServerUrl } = await load();
    expect(await setMobileServerUrl(`${NEW_URL}/`, "admin")).toBe(NEW_URL);
    expect(db.rows.get("mobileServerUrl")).toBe(NEW_URL);
  });

  it("refuses an address this server could not reach, and keeps nothing", async () => {
    db.check.mockResolvedValue("unreachable");
    const { setMobileServerUrl } = await load();
    const error = await refusal(setMobileServerUrl(NEW_URL, "admin"));
    expect(error.status).toBe(502);
    expect(db.rows.has("mobileServerUrl")).toBe(false);
  });

  it("saves it anyway when told to: the phones still check it themselves", async () => {
    db.check.mockResolvedValue("unreachable");
    const { setMobileServerUrl } = await load();
    expect(await setMobileServerUrl(NEW_URL, "admin", { force: true })).toBe(NEW_URL);
    expect(db.rows.get("mobileServerUrl")).toBe(NEW_URL);
  });

  it("never saves an address where another server answered, forced or not", async () => {
    db.check.mockResolvedValue("otherServer");
    const { setMobileServerUrl } = await load();
    const error = await refusal(setMobileServerUrl(NEW_URL, "admin", { force: true }));
    expect(error.status).toBe(409);
    expect(db.rows.has("mobileServerUrl")).toBe(false);
  });

  it("refuses a malformed address before checking anything", async () => {
    const { setMobileServerUrl } = await load();
    const error = await refusal(setMobileServerUrl("stargate.appinternal.com", "admin", { force: true }));
    expect(error.status).toBe(422);
    expect(db.check).not.toHaveBeenCalled();
  });

  it("clears without checking: empty means the app's built-in address", async () => {
    db.rows.set("mobileServerUrl", NEW_URL);
    const { setMobileServerUrl } = await load();
    expect(await setMobileServerUrl("  ", "admin")).toBe("");
    expect(db.rows.get("mobileServerUrl")).toBe("");
    expect(db.check).not.toHaveBeenCalled();
  });

  it("does not check again an address that is already saved", async () => {
    db.rows.set("mobileServerUrl", NEW_URL);
    const { setMobileServerUrl } = await load();
    expect(await setMobileServerUrl(NEW_URL, "admin")).toBe(NEW_URL);
    expect(db.check).not.toHaveBeenCalled();
  });
});
