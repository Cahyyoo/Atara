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
import { createDataSourceSchema, updateDataSourceSchema } from "@/modules/eksplorasi/validation";
import { toDateColumn, blankToNull, dataSourceWhere } from "@/modules/eksplorasi/lib/data-source";

const SUPER: Access = { role: "SUPER_ADMIN", department: null };
const LAB_ADMIN: Access = { role: "ADMIN", department: "LAB" };
const EKS_ADMIN: Access = { role: "ADMIN", department: "EKSPLORASI" };
const PREPARATOR: Access = { role: "PREPARATOR", department: "LAB" };

describe("who manages whose account", () => {
  it("lets the super admin manage the admins of every department, and nobody else", () => {
    expect(manageableTargets(SUPER)).toEqual([
      { role: "ADMIN", department: "LAB" },
      { role: "ADMIN", department: "EKSPLORASI" },
    ]);
    expect(canManage(SUPER, LAB_ADMIN)).toBe(true);
    expect(canManage(SUPER, EKS_ADMIN)).toBe(true);
    expect(canManage(SUPER, PREPARATOR)).toBe(false);
    expect(canManage(SUPER, SUPER)).toBe(false);
  });

  it("lets the lab admin manage the lab's staff only", () => {
    expect(assignableRoles(LAB_ADMIN)).toEqual(["DATABASE", "ANALISIS", "PREPARATOR"]);
    expect(canManage(LAB_ADMIN, PREPARATOR)).toBe(true);
    expect(canManage(LAB_ADMIN, LAB_ADMIN)).toBe(false);
    expect(canManage(LAB_ADMIN, EKS_ADMIN)).toBe(false);
    expect(canAssign(LAB_ADMIN, "ADMIN", "LAB")).toBe(false);
    expect(canAssign(LAB_ADMIN, "PREPARATOR", "EKSPLORASI")).toBe(false);
  });

  it("gives everybody else nobody to manage", () => {
    for (const access of [EKS_ADMIN, PREPARATOR]) {
      expect(manageableTargets(access)).toEqual([]);
      expect(userScopeWhere(access)).toEqual({ id: { in: [] } });
    }
  });

  it("asks the super admin for a department, and nobody else", () => {
    expect(assignableDepartments(SUPER, "ADMIN")).toEqual(["LAB", "EKSPLORASI"]);
    expect(assignableDepartments(LAB_ADMIN, "PREPARATOR")).toEqual(["LAB"]);
  });

  it("never lets anybody create a super admin", () => {
    for (const access of [SUPER, LAB_ADMIN, EKS_ADMIN, PREPARATOR]) {
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
    expect(modulesFor(PREPARATOR).map((m) => m.key)).toEqual(["lab"]);
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

describe("a row of the data source", () => {
  it("needs only its sample ID and its type", () => {
    const parsed = createDataSourceSchema.parse({ sampleId: "  SMP-001 ", sampleType: "ORIGINAL" });
    expect(parsed).toMatchObject({ sampleId: "SMP-001", sampleType: "ORIGINAL" });
    expect(createDataSourceSchema.safeParse({ sampleId: "SMP-001" }).success).toBe(false);
    expect(createDataSourceSchema.safeParse({ sampleId: " ", sampleType: "BLANK" }).success).toBe(false);
  });

  it("keeps a value as the lab wrote it, within the column's length", () => {
    const parsed = createDataSourceSchema.parse({ sampleId: "A", sampleType: "BLANK", ni: "<0.01" });
    expect(parsed.ni).toBe("<0.01");
    expect(createDataSourceSchema.safeParse({ sampleId: "A", sampleType: "BLANK", ni: "x".repeat(21) }).success).toBe(false);
    expect(createDataSourceSchema.safeParse({ sampleId: "A", sampleType: "BLANK", date: "01/10/2026" }).success).toBe(false);
  });

  it("clears a column with null, and leaves it alone when it is not sent", () => {
    expect(updateDataSourceSchema.parse({ campaign: null })).toEqual({ campaign: null });
    expect(updateDataSourceSchema.parse({})).toEqual({});
    expect(blankToNull("")).toBeNull();
    expect(blankToNull(undefined)).toBeUndefined();
    expect(toDateColumn("2026-10-11")?.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(toDateColumn(null)).toBeNull();
  });

  it("holds a QC list to its own type, whatever the query asks", () => {
    expect(dataSourceWhere({ view: "standard" })).toEqual({ sampleType: "STANDARD" });
    expect(dataSourceWhere({ view: "blank", sampleType: "DUPLICATE" })).toEqual({ sampleType: "BLANK" });
    expect(dataSourceWhere({ view: "dataSource" })).toEqual({});
    expect(dataSourceWhere({ view: "dataSource", sampleType: "ORIGINAL" })).toEqual({ sampleType: "ORIGINAL" });
  });
});
