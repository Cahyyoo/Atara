import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  DEPARTMENTS,
  PERSONAS,
  ROLES,
  can,
  isDepartment,
  isRole,
  isValidAccess,
  personaOf,
  type Access,
  type Capability,
  type Persona,
} from "@/lib/permissions";

/**
 * The role table as it was agreed, written out in full.
 *
 * Every page, route and menu item asks permissions.ts, so a slip here opens
 * or closes a door everywhere at once. Pinned by hand rather than derived, so
 * that changing who may do what has to be done twice -- once in the table and
 * once here -- and cannot happen by accident.
 */
const AGREED: Record<Persona, Capability[]> = {
  SUPER_ADMIN: ["manageUsers", "manageAnnouncements", "viewSignInAudit", "exportBackup"],
  LAB_ADMIN: [
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
  EKSPLORASI_ADMIN: ["manageDrilling"],
};

/** One account per persona, as role and department. */
const ACCOUNTS: Record<Persona, Access> = {
  SUPER_ADMIN: { role: "SUPER_ADMIN", department: null },
  LAB_ADMIN: { role: "ADMIN", department: "LAB" },
  DATABASE: { role: "DATABASE", department: "LAB" },
  ANALISIS: { role: "ANALISIS", department: "LAB" },
  OPERATOR: { role: "OPERATOR", department: "LAB" },
  EKSPLORASI_ADMIN: { role: "ADMIN", department: "EKSPLORASI" },
};

const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

describe("the role table", () => {
  for (const persona of PERSONAS) {
    it(`gives ${persona} exactly what was agreed`, () => {
      const held = ALL_CAPABILITIES.filter((cap) => can(ACCOUNTS[persona], cap));
      expect(held.sort()).toEqual([...AGREED[persona]].sort());
    });
  }

  it("keeps the sample database read-only for the lab admin", () => {
    expect(can(ACCOUNTS.LAB_ADMIN, "viewDatabase")).toBe(true);
    expect(can(ACCOUNTS.LAB_ADMIN, "editDatabase")).toBe(false);
  });

  it("leaves scanning, and correcting a scan, to the operator alone", () => {
    for (const persona of PERSONAS) {
      expect(can(ACCOUNTS[persona], "scanSamples"), persona).toBe(persona === "OPERATOR");
      expect(can(ACCOUNTS[persona], "overrideStage"), persona).toBe(persona === "OPERATOR");
    }
  });

  it("keeps each department out of the other's module", () => {
    const lab: Capability[] = ["viewDashboard", "viewDatabase", "readLabRecords", "manageMasterData"];
    for (const cap of lab) expect(can(ACCOUNTS.EKSPLORASI_ADMIN, cap), cap).toBe(false);
    for (const persona of ["LAB_ADMIN", "DATABASE", "ANALISIS", "OPERATOR"] as const) {
      expect(can(ACCOUNTS[persona], "manageDrilling"), persona).toBe(false);
    }
  });

  it("keeps the super admin out of the modules' work", () => {
    for (const cap of ["viewDashboard", "viewDatabase", "manageDrilling", "manageMasterData"] as const) {
      expect(can(ACCOUNTS.SUPER_ADMIN, cap), cap).toBe(false);
    }
  });

  it("recognises only the known roles and departments", () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    for (const other of ["admin", "USER", "LAB_ADMIN", "", null, undefined, 1]) expect(isRole(other)).toBe(false);
    for (const department of DEPARTMENTS) expect(isDepartment(department)).toBe(true);
    for (const other of ["lab", "GEOLOGY", "", null]) expect(isDepartment(other)).toBe(false);
  });
});

describe("roles within departments", () => {
  it("names each valid pair as one persona", () => {
    for (const persona of PERSONAS) expect(personaOf(ACCOUNTS[persona])).toBe(persona);
  });

  it("refuses the pairs that may not exist, and grants them nothing", () => {
    const invalid: Access[] = [
      { role: "SUPER_ADMIN", department: "LAB" },
      { role: "ADMIN", department: null },
      { role: "OPERATOR", department: "EKSPLORASI" },
      { role: "DATABASE", department: null },
    ];
    for (const access of invalid) {
      expect(isValidAccess(access.role, access.department), JSON.stringify(access)).toBe(false);
      expect(personaOf(access)).toBeNull();
      expect(ALL_CAPABILITIES.some((cap) => can(access, cap))).toBe(false);
    }
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
      ["app", "api", "users", "[id]", "route.ts"],
      ["app", "(app)", "lab", "dashboard", "page.tsx"],
      ["app", "(app)", "lab", "database", "page.tsx"],
      ["app", "(app)", "lab", "samples", "[code]", "page.tsx"],
    ];
    for (const parts of files) {
      expect(read(...parts), parts.join("/")).not.toMatch(/role\s*[!=]==\s*"(SUPER_ADMIN|ADMIN|OPERATOR)"/);
    }
  });

  it("guards each page with the capability its menu item needs", () => {
    const pages: [string[], Capability][] = [
      [["app", "(app)", "users", "page.tsx"], "manageUsers"],
      [["app", "(app)", "lab", "master-data", "page.tsx"], "manageMasterData"],
      [["app", "(app)", "lab", "activity", "page.tsx"], "viewActivity"],
      [["app", "(app)", "lab", "assay", "page.tsx"], "enterResults"],
      [["app", "(app)", "lab", "database", "page.tsx"], "viewDatabase"],
      [["app", "(app)", "lab", "samples", "generate", "layout.tsx"], "generateSamples"],
      [["app", "(app)", "lab", "samples", "labels", "layout.tsx"], "printLabels"],
      [["app", "(app)", "lab", "grade", "page.tsx"], "readLabRecords"],
      [["app", "(app)", "lab", "data-quality", "page.tsx"], "viewDatabase"],
      [["app", "(app)", "lab", "dashboard", "page.tsx"], "viewDashboard"],
      [["app", "(app)", "eksplorasi", "drilling", "page.tsx"], "manageDrilling"],
      [["app", "(app)", "admin", "page.tsx"], "manageAnnouncements"],
      [["app", "(app)", "admin", "sign-ins", "page.tsx"], "viewSignInAudit"],
    ];
    const nav = read("components", "layout", "sidebar-nav.tsx");
    for (const [parts, capability] of pages) {
      expect(read(...parts), parts.join("/")).toContain(`requireCapabilityPage("${capability}")`);
      expect(nav).toContain(`capability: "${capability}"`);
    }
  });

  it("guards each module as a whole as well as page by page", () => {
    expect(read("app", "(app)", "lab", "layout.tsx")).toContain('requireCapabilityPage("viewDashboard")');
    expect(read("app", "(app)", "eksplorasi", "layout.tsx")).toContain(
      'requireCapabilityPage("manageDrilling")'
    );
  });

  it("lets only the lab admin correct a stage from the website", () => {
    for (const persona of PERSONAS) {
      expect(can(ACCOUNTS[persona], "correctStage"), persona).toBe(persona === "LAB_ADMIN");
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

  it("keeps the lab's data behind the lab, even where any lab role may read it", () => {
    for (const route of [
      ["analytics", "route.ts"],
      ["samples", "route.ts"],
      ["samples", "[code]", "route.ts"],
      ["samples", "lookup", "route.ts"],
      ["stages", "route.ts"],
      ["master-options", "route.ts"],
    ]) {
      expect(read("app", "api", ...route), route.join("/")).toContain(
        'requireCapability(request, "viewDashboard")'
      );
    }
  });

  it("guards every drilling route", () => {
    for (const route of [["drill-holes", "route.ts"], ["drill-holes", "[id]", "route.ts"]]) {
      const code = read("app", "api", ...route);
      const handlers = code.match(/export async function \w+/g) ?? [];
      const guards = code.match(/requireCapability\(request, "manageDrilling"\)/g) ?? [];
      expect(guards.length, route.join("/")).toBe(handlers.length);
    }
  });
});
