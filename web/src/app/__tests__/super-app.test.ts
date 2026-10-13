import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Access } from "@/core/lib/auth/permissions";
import {
  assignableDepartments,
  assignableRoles,
  canAssign,
  canManage,
  manageableTargets,
  userScopeWhere,
} from "@/modules/system/lib/user-scope";
import { HOME_PATH, canAccessModule, modulesFor } from "@/core/lib/app/modules";
import { MODULES } from "@/modules/registry";
import { samplePath, subSamplePath } from "@/modules/lab/lib/samples/sample-ident";
import { createDrillHoleSchema, updateDrillHoleSchema } from "@/modules/eksplorasi/validation";
import { toDateColumn, blankToNull } from "@/modules/eksplorasi/lib/drill-hole";

const SUPER: Access = { role: "SUPER_ADMIN", department: null };
const LAB_ADMIN: Access = { role: "ADMIN", department: "LAB" };
const EKS_ADMIN: Access = { role: "ADMIN", department: "EKSPLORASI" };
const OPERATOR: Access = { role: "OPERATOR", department: "LAB" };

describe("who manages whose account", () => {
  it("lets the super admin manage the admins of every department, and nobody else", () => {
    expect(manageableTargets(SUPER)).toEqual([
      { role: "ADMIN", department: "LAB" },
      { role: "ADMIN", department: "EKSPLORASI" },
    ]);
    expect(canManage(SUPER, LAB_ADMIN)).toBe(true);
    expect(canManage(SUPER, EKS_ADMIN)).toBe(true);
    expect(canManage(SUPER, OPERATOR)).toBe(false);
    expect(canManage(SUPER, SUPER)).toBe(false);
  });

  it("lets the lab admin manage the lab's staff only", () => {
    expect(assignableRoles(LAB_ADMIN)).toEqual(["DATABASE", "ANALISIS", "OPERATOR"]);
    expect(canManage(LAB_ADMIN, OPERATOR)).toBe(true);
    expect(canManage(LAB_ADMIN, LAB_ADMIN)).toBe(false);
    expect(canManage(LAB_ADMIN, EKS_ADMIN)).toBe(false);
    expect(canAssign(LAB_ADMIN, "ADMIN", "LAB")).toBe(false);
    expect(canAssign(LAB_ADMIN, "OPERATOR", "EKSPLORASI")).toBe(false);
  });

  it("gives everybody else nobody to manage", () => {
    for (const access of [EKS_ADMIN, OPERATOR]) {
      expect(manageableTargets(access)).toEqual([]);
      expect(userScopeWhere(access)).toEqual({ id: { in: [] } });
    }
  });

  it("asks the super admin for a department, and nobody else", () => {
    expect(assignableDepartments(SUPER, "ADMIN")).toEqual(["LAB", "EKSPLORASI"]);
    expect(assignableDepartments(LAB_ADMIN, "OPERATOR")).toEqual(["LAB"]);
  });

  it("never lets anybody create a super admin", () => {
    for (const access of [SUPER, LAB_ADMIN, EKS_ADMIN, OPERATOR]) {
      expect(canAssign(access, "SUPER_ADMIN", null)).toBe(false);
    }
  });

  it("is applied by every route under /api/users/[id]", () => {
    const read = (...parts: string[]) =>
      readFileSync(join(process.cwd(), "src", "app", "api", "(system)", "users", "[id]", ...parts), "utf8");
    for (const parts of [
      ["route.ts"],
      ["reset-password", "route.ts"],
      ["face", "route.ts"],
      ["totp", "route.ts"],
      ["sessions", "route.ts"],
      ["sessions", "[sessionId]", "route.ts"],
    ]) {
      const code = read(...parts);
      const handlers = code.match(/export async function \w+/g) ?? [];
      const scoped = code.match(/requireManagedUser\(/g) ?? [];
      expect(scoped.length, parts.join("/")).toBeGreaterThanOrEqual(handlers.length);
    }
  });
});

describe("the modules", () => {
  it("opens each module to its own people only", () => {
    expect(modulesFor(SUPER).map((m) => m.key)).toEqual(["system"]);
    // The lab admin also opens Settings, for the lab's staff on Users.
    expect(modulesFor(LAB_ADMIN).map((m) => m.key)).toEqual(["lab", "system"]);
    expect(modulesFor(OPERATOR).map((m) => m.key)).toEqual(["lab"]);
    expect(modulesFor(EKS_ADMIN).map((m) => m.key)).toEqual(["eksplorasi"]);
    expect(canAccessModule({ role: "ADMIN", department: null }, "lab")).toBe(false);
  });

  it("keeps every module's pages under its own path", () => {
    for (const appModule of MODULES) {
      expect(appModule.homePath.startsWith(appModule.basePath), appModule.key).toBe(true);
    }
    expect(HOME_PATH).toBe("/home");
  });

  it("puts a sample's pages in the lab module", () => {
    expect(samplePath("NKL 1/2")).toBe("/lab/samples/NKL%201%2F2");
    expect(subSamplePath("NKL-1", "-20")).toBe("/lab/samples/NKL-1/sub/-20");
  });
});

describe("a drill hole", () => {
  it("needs only its hole ID, and starts as planned", () => {
    const parsed = createDrillHoleSchema.parse({ holeId: "  DH-001 " });
    expect(parsed).toMatchObject({ holeId: "DH-001", status: "PLANNED" });
  });

  it("refuses an orientation that cannot be", () => {
    expect(createDrillHoleSchema.safeParse({ holeId: "A", azimuth: 361 }).success).toBe(false);
    expect(createDrillHoleSchema.safeParse({ holeId: "A", dip: -91 }).success).toBe(false);
    expect(createDrillHoleSchema.safeParse({ holeId: "A", totalDepth: -1 }).success).toBe(false);
    expect(createDrillHoleSchema.safeParse({ holeId: "A", azimuth: 0, dip: -90 }).success).toBe(true);
  });

  it("refuses an end before the start", () => {
    const body = { holeId: "A", startDate: "2026-10-02", endDate: "2026-10-01" };
    expect(createDrillHoleSchema.safeParse(body).success).toBe(false);
    expect(updateDrillHoleSchema.safeParse(body).success).toBe(false);
    expect(createDrillHoleSchema.safeParse({ ...body, endDate: "2026-10-02" }).success).toBe(true);
  });

  it("clears a column with null, and leaves it alone when it is not sent", () => {
    expect(updateDrillHoleSchema.parse({ area: null })).toEqual({ area: null });
    expect(updateDrillHoleSchema.parse({})).toEqual({});
    expect(blankToNull("")).toBeNull();
    expect(blankToNull(undefined)).toBeUndefined();
    expect(toDateColumn("2026-10-11")?.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(toDateColumn(null)).toBeNull();
  });
});
