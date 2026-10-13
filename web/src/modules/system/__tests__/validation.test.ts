import { describe, expect, it } from "vitest";
import { createUserSchema, rolePasswordSchema, updateUserSchema } from "@/modules/system/validation";

describe("createUserSchema", () => {
  const base = { name: "QA Tester", email: "qa@atara.local" };

  it("takes no password: a new account starts on its role's default", () => {
    expect(createUserSchema.safeParse(base).success).toBe(true);
    expect(createUserSchema.parse({ ...base, password: "12345678" })).not.toHaveProperty("password");
  });

  it("defaults new accounts to operator", () => {
    expect(createUserSchema.parse(base).role).toBe("OPERATOR");
  });

  it("rejects a malformed email", () => {
    expect(createUserSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("drops a password: an administrator only resets to the default", () => {
    expect(updateUserSchema.parse({ name: "A", password: "12345678" })).not.toHaveProperty("password");
  });
});

describe("rolePasswordSchema", () => {
  it("requires a known role and at least eight characters", () => {
    expect(rolePasswordSchema.safeParse({ role: "OPERATOR", password: "1234567" }).success).toBe(false);
    expect(rolePasswordSchema.safeParse({ role: "OPERATOR", password: "12345678" }).success).toBe(true);
    expect(rolePasswordSchema.safeParse({ role: "GUEST", password: "12345678" }).success).toBe(false);
  });
});
