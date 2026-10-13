import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";

/**
 * What the two paste previews -- the import screen and the paste dialog --
 * read the same way.
 */

/** The counters carry the totals; the table is there to spot-check. */
export const PREVIEW_ROW_LIMIT = 200;

export function labelFor(key: string): string {
  return ASSAY_FIELDS.find((field) => field.key === key)?.shortLabel ?? key;
}
