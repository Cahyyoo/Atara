import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { coreMessages, messagesFor } from "@/core/i18n/catalogue";
import type { MessageTree } from "@/core/i18n/merge";
import { MODULES } from "@/modules/registry";

/**
 * The browser only gets the shared catalogue plus the catalogues of the
 * modules its person works in (catalogue.ts). A client component that reads a
 * namespace from somewhere else would render fine on the server and then
 * throw in the browser -- and only for the people who lack that module.
 *
 * So every literal `useTranslations("…")` in a "use client" file is checked
 * against what its place may count on: core files against the shared
 * catalogue, a module's files against shared + that module.
 */

const SRC = join(process.cwd(), "src");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : files(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function has(tree: MessageTree, path: string): boolean {
  let node: MessageTree | string | undefined = tree;
  for (const key of path.split(".")) {
    if (typeof node !== "object" || !(key in node)) return false;
    node = node[key];
  }
  return true;
}

/** Which catalogue a file may rely on in the browser, by where it lives. */
function allowedFor(path: string): { label: string; tree: MessageTree } {
  const rel = relative(SRC, path).split(sep);
  if (rel[0] === "modules") return { label: rel[1], tree: messagesFor("en", [rel[1] as never]) };
  if (rel[0] === "app" && rel.includes("lab")) return { label: "lab", tree: messagesFor("en", ["lab"]) };
  if (rel[0] === "app" && rel.includes("eksplorasi")) {
    return { label: "eksplorasi", tree: messagesFor("en", ["eksplorasi"]) };
  }
  return { label: "core", tree: coreMessages("en") };
}

describe("namespaces a browser component reads", () => {
  const clientFiles = [...files(join(SRC, "core")), ...files(join(SRC, "modules")), ...files(join(SRC, "app"))].filter(
    (path) => /^["']use client["']/.test(readFileSync(path, "utf8").trimStart())
  );

  it("finds the client components, so an empty pass cannot be a broken walk", () => {
    expect(clientFiles.length).toBeGreaterThan(50);
  });

  it("are all in the catalogues that reach that browser", () => {
    const missing: string[] = [];
    for (const path of clientFiles) {
      const source = readFileSync(path, "utf8");
      const { label, tree } = allowedFor(path);
      for (const [, namespace] of source.matchAll(/useTranslations\(\s*"([^"]+)"\s*\)/g)) {
        if (!has(tree, namespace)) missing.push(`${relative(SRC, path)}: "${namespace}" (not in ${label})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("covers every module the registry knows", () => {
    for (const appModule of MODULES) {
      expect(() => messagesFor("en", [appModule.key])).not.toThrow();
    }
  });
});
