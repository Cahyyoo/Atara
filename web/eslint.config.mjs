import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * The modules of the super app, each a folder under src/modules. Listed here
 * so the boundary rules below are written once per module, not per pair; a
 * new module adds its key (see docs/MODULES.md).
 */
const MODULES = ["lab", "eksplorasi", "system"];

/** The registry files: the only module code the shared core may import. */
const REGISTRY_FILES = ["./registry.ts", "./capabilities.ts", "./messages.ts", "./backup.ts"];

const boundaryZones = [
  // Core is shared by every module, so it knows none of them -- except
  // through the registry, which is how modules announce themselves.
  {
    target: "./src/core",
    from: "./src/modules",
    except: REGISTRY_FILES,
    message: "core must not import a module; go through src/modules/registry.ts (see docs/MODULES.md).",
  },
  // A module never reaches into another one. What they share lives in core.
  ...MODULES.flatMap((module) =>
    MODULES.filter((other) => other !== module).flatMap((other) => [
      {
        target: `./src/modules/${module}`,
        from: `./src/modules/${other}`,
        message: `The ${module} module must not import the ${other} module; move what both need into src/core.`,
      },
      // A module's API routes, grouped as api/(<module>), follow the same rule.
      {
        target: `./src/app/api/(${module})`,
        from: `./src/modules/${other}`,
        message: `API routes of the ${module} module must not import the ${other} module.`,
      },
    ])
  ),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "import/no-restricted-paths": ["error", { zones: boundaryZones }],
    },
  },
  // One file, one responsibility: past 300 lines of code (comments and blank
  // lines do not count) a file is split -- see "Pola pemecahan" in
  // docs/MODULES.md. A very long function is flagged too, as a hint.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/__tests__/**"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
