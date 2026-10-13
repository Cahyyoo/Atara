import { IMPORT_EXAMPLE_COLUMNS } from "@/modules/lab/lib/records/lab-record-import";
import type { ImportPreviewRow } from "@/modules/lab/types";

/** Long enough to let a paste settle, short enough that the preview feels immediate. */
export const PREVIEW_DELAY_MS = 400;

/** Problems first: they are what somebody has to act on before saving. */
export const STATUS_ORDER: Record<ImportPreviewRow["status"], number> = {
  invalid: 0,
  unknown: 1,
  update: 2,
  create: 3,
  unchanged: 4,
};

export function formatValue(value: number | string | null): string {
  return value === null || value === "" ? "—" : String(value);
}

/**
 * The heading row a sheet needs, in the order the instrument reports.
 *
 * All of them. This used to list the five columns the database table shows,
 * and those are two different questions: five is a sensible default for a
 * table somebody reads, and it was being shown here as though it were the
 * format this screen accepts. It never was -- the importer maps headings
 * through the same fieldForHeader the paste dialog uses, so it has always
 * taken every element plus the instrument's own three columns.
 *
 * An example that under-describes what is accepted costs somebody the work of
 * cutting columns out of a sheet that would have imported untouched.
 */
export const EXAMPLE_HEADER = IMPORT_EXAMPLE_COLUMNS.join("\t");

/** Whether the keystroke that is about to paste belongs to some other box. */
export function pastingElsewhere(target: EventTarget | null, own: HTMLElement | null): boolean {
  if (!(target instanceof HTMLElement) || target === own) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
