import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, ROLES, can, isRole, type Capability, type Role } from "@/lib/permissions";

/**
 * The role table as it was agreed, written out in full.
 *
 * Every page, route and menu item asks permissions.ts, so a slip here opens
 * or closes a door everywhere at once. Pinned by hand rather than derived, so
 * that changing who may do what has to be done twice -- once in the table and
 * once here -- and cannot happen by accident.
 */
const AGREED: Record<Role, Capability[]> = {
  ADMIN: [
    "viewDashboard",
    "manageDashboard",
    "viewDatabase",
    "exportDatabase",
    "viewDeletedRecords",
    "viewRecordHistory",
    "readLabRecords",
    "viewActivity",
    "manageUsers",
    "manageMasterData",
    "correctStage",
    "manageAnnouncements",
    "exportBackup",
  ],
  DATABASE: [
    "viewDashboard",
    "viewDatabase",
    "exportDatabase",
    "viewDeletedRecords",
    "viewRecordHistory",
    "editDatabase",
    "generateSamples",
    "printLabels",
    "readLabRecords",
  ],
  ANALISIS: ["viewDashboard", "viewRecordHistory", "enterResults", "readLabRecords"],
  OPERATOR: ["viewDashboard", "scanSamples", "overrideStage"],
};

describe("the role table", () => {
  for (const role of ROLES) {
    it(`gives ${role} exactly what was agreed`, () => {
      const held = (Object.keys(CAPABILITIES) as Capability[]).filter((cap) => can(role, cap));
      expect(held.sort()).toEqual([...AGREED[role]].sort());
    });
  }

  it("keeps the sample database read-only for an administrator", () => {
    expect(can("ADMIN", "viewDatabase")).toBe(true);
    expect(can("ADMIN", "editDatabase")).toBe(false);
  });

  it("leaves scanning, and correcting a scan, to the operator alone", () => {
    for (const role of ROLES) {
      expect(can(role, "scanSamples"), role).toBe(role === "OPERATOR");
      expect(can(role, "overrideStage"), role).toBe(role === "OPERATOR");
    }
  });

  it("recognises only the four roles", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    for (const other of ["admin", "USER", "", null, undefined, 1]) expect(isRole(other)).toBe(false);
  });
});

describe("where the table is enforced", () => {
  const read = (...parts: string[]) =>
    readFileSync(join(process.cwd(), "src", ...parts), "utf8");

  it("has no role name compared by hand outside permissions.ts", () => {
    // The shape that used to be everywhere. A new one would be a rule the
    // table does not know about.
    const files = [
      ["lib", "api-auth.ts"],
      ["lib", "page-auth.ts"],
      ["lib", "stage-transition.ts"],
      ["components", "layout", "sidebar-nav.tsx"],
      ["app", "api", "lab-records", "route.ts"],
      ["app", "(app)", "dashboard", "page.tsx"],
      ["app", "(app)", "database", "page.tsx"],
      ["app", "(app)", "samples", "[code]", "page.tsx"],
    ];
    for (const parts of files) {
      expect(read(...parts), parts.join("/")).not.toMatch(/role\s*[!=]==\s*"(ADMIN|OPERATOR)"/);
    }
  });

  it("guards each page with the capability its menu item needs", () => {
    const pages: [string[], Capability][] = [
      [["app", "(app)", "users", "page.tsx"], "manageUsers"],
      [["app", "(app)", "master-data", "page.tsx"], "manageMasterData"],
      [["app", "(app)", "activity", "page.tsx"], "viewActivity"],
      [["app", "(app)", "assay", "page.tsx"], "enterResults"],
      [["app", "(app)", "database", "page.tsx"], "viewDatabase"],
      [["app", "(app)", "samples", "generate", "layout.tsx"], "generateSamples"],
      [["app", "(app)", "samples", "labels", "layout.tsx"], "printLabels"],
      [["app", "(app)", "grade", "page.tsx"], "readLabRecords"],
      [["app", "(app)", "data-quality", "page.tsx"], "viewDatabase"],
      [["app", "(app)", "admin", "page.tsx"], "manageAnnouncements"],
      [["app", "(app)", "help", "page.tsx"], "viewDashboard"],
    ];
    const nav = read("components", "layout", "sidebar-nav.tsx");
    for (const [parts, capability] of pages) {
      expect(read(...parts), parts.join("/")).toContain(`requireCapabilityPage("${capability}")`);
      expect(nav).toContain(`capability: "${capability}"`);
    }
  });

  it("lets only an administrator correct a stage from the website", () => {
    for (const role of ROLES) {
      expect(can(role, "correctStage"), role).toBe(role === "ADMIN");
    }
    expect(read("app", "api", "samples", "[code]", "stage", "route.ts")).toContain(
      'requireCapability(request, "correctStage")'
    );
  });

  it("lets only the operator scan", () => {
    expect(read("app", "api", "samples", "scan", "route.ts")).toContain(
      'requireCapability(request, "scanSamples")'
    );
  });
});
