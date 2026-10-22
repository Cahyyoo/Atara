#!/usr/bin/env node
/**
 * Scaffolds a new module of the super app, laid out the way every module is
 * (docs/MODULES.md), so the next one starts uniform instead of from a copy of
 * whichever module somebody opened first.
 *
 *   npm run module:new -- <key> [--persona <PERSONA>] [--root <dir>]
 *
 *   <key>      lower-case module key, also its URL and API group: "geologi"
 *   --persona  who works in it (default <KEY>_ADMIN); must be a persona in
 *              src/core/lib/auth/permissions.ts -- add it there if new
 *   --root     where the web app is (default: the current directory)
 *
 * It only creates new files. The few lines that register the module in the
 * shared files are printed for you to add by hand, so they show up in review.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const key = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));

if (!key || !/^[a-z][a-z0-9-]*$/.test(key)) {
  console.error("Usage: npm run module:new -- <key> [--persona <PERSONA>] [--root <dir>]");
  console.error('  <key> is lower-case letters, digits and dashes, e.g. "geologi".');
  process.exit(1);
}

const root = option("root", process.cwd());
const words = key.split("-");
const camel = words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const pascal = camel[0].toUpperCase() + camel.slice(1);
const constant = key.replace(/-/g, "_").toUpperCase();
const persona = option("persona", `${constant}_ADMIN`);
const capability = `view${pascal}`;

const files = {
  [`src/modules/${key}/module.ts`]: `import { IoCubeOutline } from "react-icons/io5";
import type { AppModule } from "@/core/lib/app/module-types";

/**
 * The ${pascal} module. Its pages live under /${key}; this manifest is how the
 * shared shell, portal and guide learn about them (src/modules/registry.ts).
 */
export const ${camel}Module = {
  key: "${key}",
  basePath: "/${key}",
  homePath: "/${key}/home",
  icon: IoCubeOutline,
  personas: ["${persona}"],
  nav: [{ href: "/${key}/home", key: "${camel}Home", icon: IoCubeOutline, capability: "${capability}" }],
  helpSections: [],
  tours: [],
} as const satisfies AppModule;
`,

  [`src/modules/${key}/capabilities.ts`]: `import type { Persona } from "@/core/lib/auth/permissions";

/** Who may do what in the ${pascal} module, by persona. Merged in src/modules/capabilities.ts. */
export const ${constant}_CAPABILITIES = {
  /** The module's pages. */
  ${capability}: ["${persona}"],
} as const satisfies Record<string, readonly Persona[]>;
`,

  [`src/modules/${key}/types.ts`]: `/** What the ${pascal} module's routes send to the browser. */
export interface ${pascal}ItemDTO {
  id: string;
  name: string;
}
`,

  [`src/modules/${key}/validation.ts`]: `import { z } from "zod";
import { paginationQuery } from "@/core/lib/http/pagination";

/** Input schemas of the ${pascal} module. */
export const list${pascal}QuerySchema = z.object({
  search: z.string().trim().optional(),
  ...paginationQuery(),
});
`,

  [`src/modules/${key}/messages/id.json`]: JSON.stringify(
    {
      [camel]: { title: pascal, subtitle: `Halaman utama modul ${pascal}.` },
      nav: { [`${camel}Home`]: pascal, groups: { [key]: pascal } },
      home: { modules: { [key]: { name: pascal, description: `Modul ${pascal}.` } } },
    },
    null,
    2
  ) + "\n",

  [`src/modules/${key}/messages/en.json`]: JSON.stringify(
    {
      [camel]: { title: pascal, subtitle: `The ${pascal} module's home page.` },
      nav: { [`${camel}Home`]: pascal, groups: { [key]: pascal } },
      home: { modules: { [key]: { name: pascal, description: `The ${pascal} module.` } } },
    },
    null,
    2
  ) + "\n",

  [`src/modules/${key}/__tests__/module.test.ts`]: `import { describe, expect, it } from "vitest";
import { ${camel}Module } from "@/modules/${key}/module";
import { ${constant}_CAPABILITIES } from "@/modules/${key}/capabilities";

describe("the ${pascal} module", () => {
  it("guards its menu with its own capabilities", () => {
    for (const item of ${camel}Module.nav) expect(Object.keys(${constant}_CAPABILITIES)).toContain(item.capability);
  });
});
`,

  [`src/app/(app)/${key}/layout.tsx`]: `import type { ReactNode } from "react";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";

/** The ${pascal} module: only its people come in; everybody else is sent to the portal. */
export default async function ${pascal}Layout({ children }: { children: ReactNode }) {
  await requireCapabilityPage("${capability}");
  return children;
}
`,

  [`src/app/(app)/${key}/page.tsx`]: `import { redirect } from "next/navigation";

/** The module's own address opens its home page. */
export default function ${pascal}Page() {
  redirect("/${key}/home");
}
`,

  [`src/app/(app)/${key}/home/page.tsx`]: `import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { PageHeader } from "@/core/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function ${pascal}HomePage() {
  await requireCapabilityPage("${capability}");
  const t = await getTranslations("${camel}");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
    </div>
  );
}
`,

  [`src/app/(app)/${key}/home/loading.tsx`]: `import { PageHeadingSkeleton } from "@/core/components/layout/page-skeleton";

export default function ${pascal}HomeLoading() {
  return <PageHeadingSkeleton />;
}
`,

  [`src/app/api/(${key})/${key}/route.ts`]: `import { route } from "@/core/lib/http/api-route";
import { jsonSuccess } from "@/core/lib/http/api-response";
import { list${pascal}QuerySchema } from "@/modules/${key}/validation";

/** An example list route: guarded, its query validated. Replace with the module's own. */
export const GET = route({ capability: "${capability}", query: list${pascal}QuerySchema }, async ({ query }) =>
  jsonSuccess({ items: [], search: query.search ?? null })
);
`,

  [`prisma/schema/${key}.prisma`]: `// ${pascal} module: its tables. Prisma reads every .prisma file in this folder
// as one schema. Every table is prefixed with the module: @@map("${constant.toLowerCase()}_..."),
// checked by architecture.test.ts. Add models here, then:
// npx prisma migrate dev --create-only, check the SQL, npx prisma migrate deploy.
`,
};

const existing = Object.keys(files).filter((path) => existsSync(join(root, path)));
if (existing.length > 0) {
  console.error(`Refusing to overwrite:\n  ${existing.join("\n  ")}`);
  process.exit(1);
}
for (const [path, content] of Object.entries(files)) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`created  ${path}`);
}

console.log(`
Now register the module (by hand, so it shows up in review):

  src/modules/registry.ts
    import { ${camel}Module } from "@/modules/${key}/module";
    export const MODULES = [..., ${camel}Module]

  src/modules/capabilities.ts
    import { ${constant}_CAPABILITIES } from "@/modules/${key}/capabilities";
    MODULE_CAPABILITIES: { ..., "${key}": ${constant}_CAPABILITIES }
    CAPABILITIES: { ..., ...${constant}_CAPABILITIES }

  src/modules/messages.ts
    import ${camel}Id from "@/modules/${key}/messages/id.json";
    import ${camel}En from "@/modules/${key}/messages/en.json";
    ModuleCatalogue = ... & typeof ${camel}En
    MODULE_MESSAGES: { ..., "${key}": { id: ${camel}Id, en: ${camel}En } }

  eslint.config.mjs
    const MODULES = [..., "${key}"];

  If "${persona}" is a new persona (a new department):
    prisma/schema/core.prisma        enum Department { ... ${constant} }  (then a migration)
    src/core/lib/auth/permissions.ts DEPARTMENTS, ROLE_DEPARTMENTS, PERSONAS, personaOf()
    src/modules/system/lib/user-scope.ts   who may create its admin

  The tests that pin who may do what fail until you agree to the new access:
    src/core/lib/auth/__tests__/permissions.test.ts   ("gives <PERSONA> exactly what was agreed")
    src/app/__tests__/super-app.test.ts               ("opens each module to its own people only")

  Optional: src/modules/${key}/backup-sheets.ts and its line in src/modules/backup.ts.

Then: npx tsc --noEmit && npm run lint && npm test   (see docs/MODULES.md)
`);
