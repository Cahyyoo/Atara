/**
 * The workflow's five stages, and how to say them.
 *
 * The wording lives in the message catalogues rather than in the database,
 * because a stage name is app vocabulary and not something anyone types: the
 * update endpoint accepts only the description. The row carries a
 * stable key instead, which is what the translation hangs on and what crosses
 * the API — the server has no locale, so it must never be the thing that picks
 * the words.
 */
export const STAGE_KEYS = ["RECEIVED", "WET_PREP", "DRY_PREP", "ANALYSIS", "REPORT"] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

function isStageKey(value: string | null | undefined): value is StageKey {
  return typeof value === "string" && (STAGE_KEYS as readonly string[]).includes(value);
}

/**
 * What to call a stage on screen.
 *
 * Falls back to the name stored on the row, for a stage added later that has
 * no key yet. Checked against the known list rather than handed to `t`
 * directly: an unrecognised key would otherwise throw and take the whole
 * screen with it, and a stage nobody has translated is worth showing under its
 * stored name, not worth a blank page.
 */
export function stageLabel(
  t: (key: StageKey) => string,
  key: string | null | undefined,
  fallbackName: string
): string {
  return isStageKey(key) ? t(key) : fallbackName;
}
