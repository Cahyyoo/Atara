import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every page that renders on the server needs a loading boundary.
 *
 * Without one, Next has nothing to show when a link is clicked: the browser
 * sits on the previous page, unchanged, until the whole render comes back. A
 * screen that does not change is what reads as stuck — regardless of how long
 * it actually takes, and these pages take 15-35ms.
 *
 * It is also the thing most easily forgotten when a page is added, and
 * forgetting it produces no error, no warning and no test failure. Hence this.
 */

const APP = join(process.cwd(), "src", "app");

function pageDirs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const path = join(directory, entry.name);
    const here = existsSync(join(path, "page.tsx")) ? [path] : [];
    return [...here, ...pageDirs(path)];
  });
}

/** A page whose whole body is a redirect never renders, so it needs nothing. */
function isRedirectOnly(path: string): boolean {
  const source = readFileSync(join(path, "page.tsx"), "utf8");
  return source.includes("redirect(") && !source.includes("return (");
}

/** A boundary anywhere up the segment tree covers the pages beneath it. */
function hasBoundaryAtOrAbove(path: string): boolean {
  let current = path;
  while (current.startsWith(APP)) {
    if (existsSync(join(current, "loading.tsx"))) return true;
    current = join(current, "..");
  }
  return false;
}

const asRoute = (path: string) => path.slice(APP.length + 1).split(sep).join("/");

describe("loading boundaries", () => {
  it("covers every page that actually renders", () => {
    const uncovered = pageDirs(APP)
      .filter((path) => !isRedirectOnly(path))
      .filter((path) => !hasBoundaryAtOrAbove(path))
      .map(asRoute);

    expect(uncovered).toEqual([]);
  });

  it("finds pages at all, so an empty pass cannot be a broken walk", () => {
    expect(pageDirs(APP).length).toBeGreaterThan(8);
  });
});

describe("the skeletons are shaped like the pages", () => {
  /**
   * A skeleton with the wrong number of columns makes the table jump when the
   * data lands, and that jump is more noticeable than the wait it was hiding.
   */
  const COLUMNS: Record<string, number> = {
    "users": 6,
    "lab/database": 10,
    "lab/assay": 9,
    "lab/samples/labels": 5,
    "eksplorasi/data-source": 24,
    "eksplorasi/standard": 24,
    "eksplorasi/blank": 25,
    "eksplorasi/duplicate": 27,
  };

  for (const [route, columns] of Object.entries(COLUMNS)) {
    it(`the ${route} skeleton asks for ${columns} columns`, () => {
      const source = readFileSync(join(APP, "(app)", ...route.split("/"), "loading.tsx"), "utf8");
      expect(source).toContain(`columns={${columns}}`);
    });
  }

  it("the users skeleton matches what users-table actually renders", () => {
    // The real table's empty row spans its own column count; that is the
    // number the skeleton has to agree with.
    const table = readFileSync(
      join(process.cwd(), "src", "modules", "system", "components", "users", "users-table.tsx"),
      "utf8"
    );
    const spans = [...table.matchAll(/colSpan=\{(\d+)\}/g)].map((match) => Number(match[1]));

    expect(spans.length).toBeGreaterThan(0);
    expect(new Set(spans).size).toBe(1);
    expect(spans[0]).toBe(COLUMNS.users);
  });
});
