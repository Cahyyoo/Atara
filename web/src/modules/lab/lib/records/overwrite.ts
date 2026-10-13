import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";

/**
 * Replacing an assay result that is already there.
 *
 * Filling an empty field is the everyday case and needs no thought; replacing
 * a figure the lab already reported is a decision -- a re-run, a correction --
 * and must not happen because a sheet was pasted onto the wrong rows. So every
 * write path asks this first, the screens show what would be replaced, and the
 * server refuses unless the request says it means it.
 *
 * Pure, and free of Prisma, so the paste and entry screens use the same rule
 * as the API.
 */

/** The results: the assays and what the instrument reported with them. */
export const RESULT_KEYS: readonly string[] = [
  ...ASSAY_FIELDS.map((field) => field.key),
  "measurementMethod",
  "solutionId",
  "measurementFinished",
  "xrayInstrument",
];

export interface Overwrite {
  field: string;
  from: number | string;
  to: number | string | null;
}

/** Decimal objects, dates and numeric strings, flattened so equal values compare equal. */
function plain(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const text = value.trim();
    return text === "" ? null : text;
  }
  // A Prisma Decimal, without importing Prisma into the browser.
  if (typeof value === "object" && typeof (value as { toString?: unknown }).toString === "function") {
    const number = Number(String(value));
    return Number.isNaN(number) ? String(value) : number;
  }
  return String(value);
}

function same(a: number | string | null, b: number | string | null): boolean {
  if (a === b) return true;
  // "1.20" in a sheet and 1.2 stored are the same figure.
  if (a !== null && b !== null && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b))) {
    return Number(a) === Number(b);
  }
  return false;
}

/**
 * The results this update would replace: fields that hold a value now and
 * would hold a different one -- emptied included -- after it. Fields the
 * update leaves out, and fields that are empty now, are not listed.
 */
export function findOverwrites(
  current: Record<string, unknown>,
  update: Record<string, unknown>
): Overwrite[] {
  const overwrites: Overwrite[] = [];
  for (const field of RESULT_KEYS) {
    if (update[field] === undefined) continue;
    const from = plain(current[field]);
    const to = plain(update[field]);
    if (from !== null && !same(from, to)) overwrites.push({ field, from, to });
  }
  return overwrites;
}

/** The update with every result that would replace a stored one left out. */
export function withoutOverwrites<T extends Record<string, unknown>>(current: Record<string, unknown>, update: T): T {
  const replaced = new Set(findOverwrites(current, update).map((entry) => entry.field));
  return Object.fromEntries(Object.entries(update).filter(([key]) => !replaced.has(key))) as T;
}
