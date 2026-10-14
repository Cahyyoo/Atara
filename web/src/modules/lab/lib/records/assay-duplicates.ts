import { ASSAY_FIELDS, MAX_ASSAY_DECIMALS } from "@/modules/lab/lib/records/assay";

/**
 * Results that read exactly like another sample's.
 *
 * Two samples almost never assay alike to the last decimal in every element,
 * so a row that does is most often a line pasted twice, or pasted against the
 * wrong Sample ID. Flagged, not refused: the reader decides.
 *
 * Kept pure, so the import route, the paste sheet and the tests all read
 * "the same results" one way.
 */

/** The 18 stored results, in a fixed order. */
export const ASSAY_KEYS = ASSAY_FIELDS.map((field) => field.key);

type AssayValues = Partial<Record<string, number | string | null | undefined>>;

/** How a value is stored: to ten decimals, as the DECIMAL(14,10) columns hold it. */
export function assayValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(MAX_ASSAY_DECIMALS)) : null;
}

/**
 * A row's results as one string, or null when it has none: an empty row is
 * like every other empty row, and that says nothing.
 */
export function assayKey(values: AssayValues): string | null {
  const parts = ASSAY_KEYS.map((key) => assayValue(values[key]));
  if (parts.every((part) => part === null)) return null;
  return parts.map((part) => (part === null ? "-" : part.toFixed(MAX_ASSAY_DECIMALS))).join("|");
}

/** The stored-value filter that finds other records with exactly these results. */
export function assayWhere(values: AssayValues): Record<string, number | null> {
  return Object.fromEntries(ASSAY_KEYS.map((key) => [key, assayValue(values[key])]));
}

/**
 * Which rows share their results with which others: for each row with a key,
 * the ids of the other rows with the same one. Rows alone with their key are
 * left out.
 */
export function groupDuplicates<Id>(rows: readonly { id: Id; key: string | null }[]): Map<Id, Id[]> {
  const byKey = new Map<string, Id[]>();
  for (const { id, key } of rows) {
    if (key === null) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), id]);
  }
  const duplicates = new Map<Id, Id[]>();
  for (const ids of byKey.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) duplicates.set(id, ids.filter((other) => other !== id));
  }
  return duplicates;
}

/** A row flagged as a look-alike, as a screen knows it. */
export interface DuplicateEntry {
  /** Its row number on the sheet or in the import. */
  row: number;
  /** Its Sample ID, as typed. */
  label: string;
  /** Other rows with exactly the same results. */
  lines?: number[];
  /** Stored samples with exactly the same results. */
  samples?: string[];
}

/** What a warning lists: rows alike among themselves, or a row like a stored sample. */
export type DuplicateGroup =
  | { kind: "rows"; rows: { row: number; label: string }[] }
  | { kind: "stored"; row: number; label: string; samples: string[] };

/**
 * The flagged rows as a reader takes them in: each set of rows alike among
 * themselves once ("rows 2, 3 and 7"), then each row like a stored sample,
 * in row order.
 */
export function duplicateGroups(entries: readonly DuplicateEntry[]): DuplicateGroup[] {
  const labelOf = new Map(entries.map((entry) => [entry.row, entry.label]));
  const seen = new Set<string>();
  const groups: DuplicateGroup[] = [];
  for (const entry of [...entries].sort((a, b) => a.row - b.row)) {
    if (!entry.lines?.length) continue;
    const rows = [...new Set([entry.row, ...entry.lines])].sort((a, b) => a - b);
    const key = rows.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ kind: "rows", rows: rows.map((row) => ({ row, label: labelOf.get(row) ?? "" })) });
  }
  for (const entry of [...entries].sort((a, b) => a.row - b.row)) {
    if (entry.samples?.length) groups.push({ kind: "stored", row: entry.row, label: entry.label, samples: entry.samples });
  }
  return groups;
}
