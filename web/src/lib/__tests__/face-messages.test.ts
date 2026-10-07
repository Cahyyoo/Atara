import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import enMessages from "../../../messages/en.json";
import { POSE_HINTS } from "@/lib/face-poses";
import { QUALITY_REASONS } from "@/lib/face-quality";
import { READING_REASONS } from "@/lib/face-enrollment";
import { REFUSAL_KEYS } from "@/lib/face-client";

/**
 * Every message in the `face` namespace has somewhere to appear.
 *
 * This is a test about missing features, not about tidiness. Keys sat unused
 * after face sign-in shipped, and three of them — removeFace, removeConfirm,
 * removed — were the only trace of a button that was never built. The DELETE
 * route existed, the commit that added it said admins could remove face data,
 * and they could not: there was nothing to click.
 *
 * Nothing catches that. The types are fine, the tests pass, the page renders.
 * The only visible residue is a message with no caller, so that is what gets
 * checked.
 */

const SOURCE_ROOT = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

/** Names bound to the face namespace in one file: `const t = useTranslations("face")`. */
const BINDS_FACE = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"face"\s*\)/g;

/** Any call of the shape `name("key")`, whichever translator it belongs to. */
const ANY_CALL = /\b(\w+)\("([a-zA-Z]+)"/g;

/**
 * Keys asked for from the `face` namespace specifically.
 *
 * The first version of this matched any `t*("key")` anywhere and compared bare
 * names, which made it blind in precisely the case it exists for:
 * `face.loading` looked alive because another file called
 * `tCommon("loading")`. The message stayed dead, the loading indicator was
 * never built, and this test reported everything as fine.
 *
 * So the translator variable is tied to its namespace first, and only calls on
 * that variable count. One pass captures both the name and the key rather than
 * building a regex per name, which keeps the escaping out of it.
 */
function keysAskedFor(): Set<string> {
  const asked = new Set<string>();

  for (const path of sourceFiles(SOURCE_ROOT)) {
    if (path.includes("__tests__")) continue;
    const source = readFileSync(path, "utf8");

    const translators = new Set([...source.matchAll(BINDS_FACE)].map((match) => match[1]));
    if (translators.size === 0) continue;

    for (const call of source.matchAll(ANY_CALL)) {
      if (translators.has(call[1])) asked.add(call[2]);
    }
  }

  /**
   * Reached through `t(poseHintKey(n))` and `t(refusal.messageKey)`, which no
   * scan of source text can see.
   * Imported rather than listed by hand: a copy kept here would drift from the
   * real list, and a drifting allowlist is how a dead key hides in the one
   * place nobody looks.
   */
  for (const key of [...POSE_HINTS, ...QUALITY_REASONS, ...READING_REASONS, ...REFUSAL_KEYS]) {
    asked.add(key);
  }

  return asked;
}

describe("the face namespace", () => {
  it("has no message that nothing renders", () => {
    const asked = keysAskedFor();
    const orphans = Object.keys(enMessages.face).filter((key) => !asked.has(key));

    expect(orphans).toEqual([]);
  });

  it("finds callers at all, so an empty pass cannot be a broken scan", () => {
    // If the scan ever stops matching, every key looks used and this test goes
    // quiet — which is the same failure it exists to prevent.
    expect(keysAskedFor().size).toBeGreaterThan(15);
  });

  it("still checks everything it was told about", () => {
    // The allowlist above must not become a way to smuggle anything through:
    // every key in it has to be a real message.
    const faceKeys = new Set(Object.keys(enMessages.face));

    for (const key of [...POSE_HINTS, ...QUALITY_REASONS, ...READING_REASONS, ...REFUSAL_KEYS]) {
      expect(faceKeys.has(key)).toBe(true);
    }
  });

  it("does not count a same-named key from another namespace", () => {
    // The flaw this test used to have. `common.loading` exists and is used;
    // that must never make `face.loading` look alive.
    const faceKeys = new Set(Object.keys(enMessages.face));

    for (const key of keysAskedFor()) {
      expect(faceKeys.has(key)).toBe(true);
    }
  });
});
