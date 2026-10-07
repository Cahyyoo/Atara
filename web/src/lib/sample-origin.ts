/**
 * Where the sample pages were opened from -- Input Hasil Uji, the Sample
 * Database, the dashboard -- so "Kembali" on any of them returns there.
 *
 * Moving among a sample's pages (the sample, its sub-samples, back to the
 * sample) adds steps to the browser's history, and stepping back one at a
 * time only walks between them. The module they were opened from is the
 * place "back" means.
 */

const KEY = "atara.sample-origin";

/** Modules that live under /samples, not pages of one sample. */
const SAMPLE_MODULES = new Set(["labels", "generate"]);

/** A page of one sample: `/samples/<code>`, or one of its sub-samples. */
export function isSamplePagePath(path: string): boolean {
  const match = /^\/samples\/([^/?#]+)(?:\/sub\/[^/?#]+)?\/?$/.exec(path.split(/[?#]/)[0]);
  return match !== null && !SAMPLE_MODULES.has(match[1]);
}

/**
 * The origin to remember on moving from `previousUrl` to `nextPath`: the page
 * left when stepping onto a sample's pages, query and all, so its filters come
 * back with it. Null leaves the remembered one as it is.
 */
export function nextOrigin(previousUrl: string | null, nextPath: string): string | null {
  if (!previousUrl || !isSamplePagePath(nextPath)) return null;
  return isSamplePagePath(previousUrl) ? null : previousUrl;
}

export function readSampleOrigin(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeSampleOrigin(url: string): void {
  try {
    window.sessionStorage.setItem(KEY, url);
  } catch {
    // A private window: "back" falls back to the browser's own history.
  }
}
