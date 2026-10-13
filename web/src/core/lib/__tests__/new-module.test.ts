import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `npm run module:new` lays a new module out the way every module is
 * (docs/MODULES.md). Run here against an empty folder, so the real tree is
 * never touched.
 */
describe("the module generator", () => {
  const root = mkdtempSync(join(tmpdir(), "atara-module-"));
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [join(process.cwd(), "scripts", "new-module.mjs"), ...args, "--root", root], {
      encoding: "utf8",
    });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("creates the standard files of a module, its pages and its API group", () => {
    const output = run("geo-tech", "--persona", "GEO_TECH_ADMIN");
    for (const path of [
      "src/modules/geo-tech/module.ts",
      "src/modules/geo-tech/capabilities.ts",
      "src/modules/geo-tech/types.ts",
      "src/modules/geo-tech/validation.ts",
      "src/modules/geo-tech/messages/id.json",
      "src/modules/geo-tech/messages/en.json",
      "src/modules/geo-tech/__tests__/module.test.ts",
      "src/app/(app)/geo-tech/layout.tsx",
      "src/app/(app)/geo-tech/home/page.tsx",
      "src/app/(app)/geo-tech/home/loading.tsx",
      "src/app/api/(geo-tech)/geo-tech/route.ts",
      "prisma/schema/geo-tech.prisma",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
    // Names follow the conventions: camelCase manifest, CONSTANT table, verbNoun capability.
    const manifest = readFileSync(join(root, "src/modules/geo-tech/module.ts"), "utf8");
    expect(manifest).toContain("export const geoTechModule");
    expect(manifest).toContain('capability: "viewGeoTech"');
    expect(readFileSync(join(root, "src/modules/geo-tech/capabilities.ts"), "utf8")).toContain(
      'GEO_TECH_CAPABILITIES = {\n  /** The module\'s pages. */\n  viewGeoTech: ["GEO_TECH_ADMIN"]'
    );
    // Guarded page and route, from the start.
    expect(readFileSync(join(root, "src/app/(app)/geo-tech/layout.tsx"), "utf8")).toContain(
      'requireCapabilityPage("viewGeoTech")'
    );
    expect(readFileSync(join(root, "src/app/api/(geo-tech)/geo-tech/route.ts"), "utf8")).toContain(
      'capability: "viewGeoTech"'
    );
    // And it says what to register by hand.
    expect(output).toContain("src/modules/registry.ts");
    expect(output).toContain("eslint.config.mjs");
  });

  it("never overwrites a module that exists", () => {
    expect(() => run("geo-tech")).toThrow();
  });

  it("refuses a key that is not a plain lower-case name", () => {
    expect(() => run("Geo Tech")).toThrow();
  });
});
