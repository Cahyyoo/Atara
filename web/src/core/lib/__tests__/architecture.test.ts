import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { PERSONAS, type Capability } from "@/core/lib/auth/permissions";
import { HELP_SECTIONS } from "@/core/lib/app/help-sections";
import { TOURS } from "@/core/lib/app/tours";
import { MODULES } from "@/modules/registry";
import { MODULE_CAPABILITIES } from "@/modules/capabilities";
import { MODULE_MESSAGES } from "@/modules/messages";

/**
 * The rules that keep the super app modular, checked on every run, so a new
 * module (or a new page in one) cannot quietly break them. See
 * docs/MODULES.md for the why; ESLint (eslint.config.mjs) checks the imports.
 */

const SRC = join(process.cwd(), "src");
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : files(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

const moduleFolders = readdirSync(join(SRC, "modules")).filter((name) =>
  statSync(join(SRC, "modules", name)).isDirectory()
);

/** Every capability a source asks for: as a route option, a guard call, or a can() check. */
function capabilitiesIn(source: string): string[] {
  return [
    ...source.matchAll(/requireCapability(?:Page)?\((?:request, )?"(\w+)"\)/g),
    ...source.matchAll(/capability: "(\w+)"/g),
    ...source.matchAll(/can\(\w+, "(\w+)"\)/g),
  ].map((m) => m[1]);
}

describe("every module is registered, and registered completely", () => {
  it("has a folder for every registered module, and a registration for every folder", () => {
    expect(MODULES.map((m) => m.key).sort()).toEqual([...moduleFolders].sort());
  });

  for (const appModule of MODULES) {
    describe(appModule.key, () => {
      const dir = join(SRC, "modules", appModule.key);

      it("has the standard files", () => {
        for (const file of ["module.ts", "capabilities.ts", "types.ts", join("messages", "id.json"), join("messages", "en.json")]) {
          expect(existsSync(join(dir, file)), file).toBe(true);
        }
        expect(existsSync(join(dir, "validation.ts")) || existsSync(join(dir, "validation")), "validation").toBe(true);
      });

      it("is wired into the capability, message and lint registries", () => {
        expect(MODULE_CAPABILITIES).toHaveProperty(appModule.key);
        expect(MODULE_MESSAGES).toHaveProperty(appModule.key);
        expect(readFileSync(join(process.cwd(), "eslint.config.mjs"), "utf8")).toContain(`"${appModule.key}"`);
      });

      it("names only real personas, and keeps its home under its path", () => {
        for (const persona of appModule.personas) expect(PERSONAS).toContain(persona);
        expect(appModule.homePath.startsWith(appModule.basePath)).toBe(true);
      });

      it("guards every page in its menu with the capability the menu shows it for", () => {
        for (const item of appModule.nav) {
          const folder = join(SRC, "app", "(app)", ...item.href.split("/").filter(Boolean));
          const guards = ["page.tsx", "layout.tsx"]
            .filter((file) => existsSync(join(folder, file)))
            .flatMap((file) => capabilitiesIn(readFileSync(join(folder, file), "utf8")));
          expect(guards, item.href).toContain(item.capability);
        }
      });
    });
  }
});

describe("the API, one route group per module", () => {
  const groups = readdirSync(join(SRC, "app", "api")).filter((name) => /^\(\w+\)$/.test(name));

  it("has a group for every module, and only the shared one besides", () => {
    expect(groups.sort()).toEqual(["(core)", ...MODULES.map((m) => `(${m.key})`)].sort());
  });

  for (const appModule of MODULES) {
    it(`guards every route of ${appModule.key} with ${appModule.key}'s capabilities`, () => {
      const own = new Set(Object.keys(MODULE_CAPABILITIES[appModule.key as keyof typeof MODULE_CAPABILITIES]));
      for (const path of files(join(SRC, "app", "api", `(${appModule.key})`), /^route\.ts$/)) {
        const source = readFileSync(path, "utf8");
        const name = relative(SRC, path).split(sep).join("/");
        const asked = capabilitiesIn(source);
        // A route with no capability must at least require a session.
        if (asked.length === 0) {
          expect(source, name).toMatch(/requireSession\(|route\(\{/);
          continue;
        }
        for (const capability of asked) expect(own.has(capability), `${name}: ${capability}`).toBe(true);
      }
    });
  }
});

describe("the guide and the tours", () => {
  it("tie every section and tour to a capability that exists", () => {
    const all = new Set<string>(Object.values(MODULE_CAPABILITIES).flatMap((table) => Object.keys(table)));
    for (const section of HELP_SECTIONS) {
      if (section.capability !== null) expect(all.has(section.capability as Capability), section.key).toBe(true);
    }
    const sections = new Set(HELP_SECTIONS.map((section) => section.key));
    for (const tour of TOURS) expect(sections.has(tour.key), tour.key).toBe(true);
  });
});

describe("imports", () => {
  it("has no barrel index.ts: every import names the file it needs", () => {
    const barrels = files(SRC, /^index\.tsx?$/).map((path) => relative(SRC, path));
    expect(barrels).toEqual([]);
  });

  it("keeps the old flat folders gone", () => {
    for (const old of ["lib", "components", "hooks", "types", "i18n"]) {
      expect(existsSync(join(SRC, old)), `src/${old}`).toBe(false);
    }
  });

  it("finds the routes and modules, so an empty pass cannot be a broken walk", () => {
    expect(files(join(SRC, "app", "api"), /^route\.ts$/).length).toBeGreaterThan(50);
    expect(read("modules", "registry.ts")).toContain("MODULES");
  });
});
