import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every text box, textarea and select must carry a name.
 *
 * This is not only an accessibility nicety here — it is what makes the filled,
 * borderless field style legitimate. A filled field sits at roughly 1.17:1
 * against the card behind it, nowhere near the 3:1 that WCAG 1.4.11 asks of a
 * UI boundary, and that is true of every filled field in every design system:
 * iOS systemGray6 on white is 1.12:1. The pattern is defensible only because
 * something else says what the control is. If a field loses its label, the box
 * really is the only thing identifying it, and then 1.17:1 is the whole story.
 *
 * So the label is the load-bearing part, and it is checked rather than trusted.
 */

const SOURCE_ROOT = join(process.cwd(), "src");
const FIELD_TAGS = ["Input", "Textarea", "SelectTrigger"] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : sourceFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** `htmlFor` values in one file, with `${...}` reduced to its literal head. */
function labelledIds(source: string): string[] {
  return [...source.matchAll(/htmlFor=\{?[`"']([^`"'}]+)/g)].map((match) =>
    match[1].split("${")[0]
  );
}

interface BareField {
  where: string;
  tag: string;
}

function bareFields(): BareField[] {
  const bare: BareField[] = [];

  for (const path of sourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(path, "utf8");
    const labelled = labelledIds(source);
    const pattern = new RegExp(`<(${FIELD_TAGS.join("|")})\\b((?:[^>]|\\n)*?)/?>`, "g");

    for (const match of source.matchAll(pattern)) {
      const [, tag, attributes] = match;
      // The primitive's own definition is the declaration, not a use of it.
      if (path.includes(join("core", "components", "ui"))) continue;
      if (/aria-label(ledby)?=/.test(attributes)) continue;

      const id = /id=\{?[`"']([^`"'}]+)/.exec(attributes)?.[1].split("${")[0];
      if (id && labelled.some((candidate) => candidate.startsWith(id) || id.startsWith(candidate))) {
        continue;
      }

      const line = source.slice(0, match.index).split("\n").length;
      bare.push({ where: `${relative(process.cwd(), path)}:${line}`, tag });
    }
  }

  return bare;
}

describe("form fields", () => {
  it("every field has a visible label or an accessible name", () => {
    const bare = bareFields();

    // Named in the message so a failure says which field, not just that one exists.
    expect(bare.map((field) => `${field.where} <${field.tag}>`)).toEqual([]);
  });

  it("finds the fields at all, so an empty pass cannot be a broken regex", () => {
    // The check above passes trivially if the scan matches nothing. This is the
    // guard that a green result means "all labelled" and not "none found".
    const total = sourceFiles(SOURCE_ROOT)
      .filter((path) => !path.includes(join("core", "components", "ui")))
      .flatMap((path) => [
        ...readFileSync(path, "utf8").matchAll(
          new RegExp(`<(${FIELD_TAGS.join("|")})\\b`, "g")
        ),
      ]).length;

    expect(total).toBeGreaterThan(25);
  });
});
