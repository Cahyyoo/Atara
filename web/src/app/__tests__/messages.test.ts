import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { id as idMessages } from "@/core/i18n/test-messages";
import { en as enMessages } from "@/core/i18n/test-messages";
import { SIGN_IN_OUTCOMES } from "@/modules/system/lib/sign-in-audit-query";

/**
 * A missing translation key does not fail the build, the linter or the type
 * checker — next-intl only throws when the component that needs it renders. So
 * `batches.dialog.name` sat broken from the day the UI became bilingual until
 * somebody opened the batch dialog.
 *
 * These tests resolve every statically written key against both locale files,
 * which is the check that would have caught it.
 */

const SOURCE_ROOT = join(process.cwd(), "src");
const MESSAGE_FILES = { id: idMessages, en: enMessages } as const;

type MessageTree = { [key: string]: string | MessageTree };

function flattenKeys(tree: MessageTree, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string") {
      keys.add(path);
    } else {
      for (const nested of flattenKeys(value, `${path}.`)) keys.add(nested);
    }
  }
  return keys;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === "__tests__" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const BINDING =
  /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)")?\s*\)/g;

interface KeyUse {
  file: string;
  line: number;
  key: string;
  dynamic: boolean;
}

/**
 * Collects every `t("...")` call and the namespace in force where it appears.
 *
 * Two details matter: the call needs a word boundary, or `set("search"` matches
 * as `t("search"`; and `t` is rebound per component, so the namespace that
 * applies is the nearest binding above the call, not the last one in the file.
 */
function collectKeyUses(): KeyUse[] {
  const uses: KeyUse[] = [];

  for (const file of sourceFiles(SOURCE_ROOT)) {
    const source = readFileSync(file, "utf8");
    const shortPath = relative(process.cwd(), file).replace(/\\/g, "/");

    const bindings = new Map<string, { at: number; namespace: string }[]>();
    for (const match of source.matchAll(BINDING)) {
      const spots = bindings.get(match[1]) ?? [];
      spots.push({ at: match.index, namespace: match[2] ?? "" });
      bindings.set(match[1], spots);
    }

    for (const [variable, spots] of bindings) {
      const call = new RegExp(
        `(?<![A-Za-z0-9_$.])${variable}\\(\\s*(["\`])([^"\`]+)\\1`,
        "g"
      );

      for (const match of source.matchAll(call)) {
        const scope = spots.filter((spot) => spot.at < match.index).at(-1);
        if (!scope) continue;

        uses.push({
          file: shortPath,
          line: source.slice(0, match.index).split("\n").length,
          key: scope.namespace ? `${scope.namespace}.${match[2]}` : match[2],
          dynamic: match[1] === "`",
        });
      }
    }
  }

  return uses;
}

describe("translation messages", () => {
  it("defines the same keys in every locale", () => {
    const id = flattenKeys(idMessages as MessageTree);
    const en = flattenKeys(enMessages as MessageTree);

    expect([...id].filter((key) => !en.has(key)).sort()).toEqual([]);
    expect([...en].filter((key) => !id.has(key)).sort()).toEqual([]);
  });

  it("resolves every key the UI asks for", () => {
    const uses = collectKeyUses();
    // A regression in the scanner itself would silently pass, so assert it found work.
    expect(uses.length).toBeGreaterThan(200);

    const missing: string[] = [];
    for (const [locale, tree] of Object.entries(MESSAGE_FILES)) {
      const keys = flattenKeys(tree as MessageTree);
      for (const use of uses) {
        if (use.dynamic || keys.has(use.key)) continue;
        missing.push(`${use.file}:${use.line} [${locale}] ${use.key}`);
      }
    }

    expect(missing.sort()).toEqual([]);
  });

  it("resolves the keys built from a template literal", () => {
    // These cannot be read off the source, so their prefixes are checked by hand.
    // Keep this list in step with the `dynamic` uses the scanner reports.
    const expected = [
      ...["PENDING", "IN_PROGRESS", "COMPLETED"].map((status) => `samples.status.${status}`),
      // The instrument's columns are named from their own key, in the column
      // pickers and the headers of both tables.
      ...["measurementMethod", "solutionId", "measurementFinished"].map(
        (field) => `database.${field}`
      ),
      // Stage names are looked up by the key stored on the row, so the scanner
      // cannot see them either.
      ...["RECEIVED", "WET_PREP", "DRY_PREP", "ANALYSIS", "REPORT"].map(
        (stage) => `stages.${stage}`
      ),
      // The sign-in trail names an outcome from the enum value on the row, in
      // the badge, the filter and the summary chips.
      ...SIGN_IN_OUTCOMES.map((outcome) => `signInAudit.outcomes.${outcome}`),
    ];

    for (const [locale, tree] of Object.entries(MESSAGE_FILES)) {
      const keys = flattenKeys(tree as MessageTree);
      for (const key of expected) {
        expect(keys.has(key), `${key} missing in ${locale}`).toBe(true);
      }
    }
  });
});
