import { normaliseNumber, type CellField, type RowValues } from "@/modules/lab/components/assay/results-grid";
import {
  ASSAY_FIELDS,
  INSTRUMENT_FIELDS,
  type AssayField,
  type InstrumentField,
} from "@/modules/lab/lib/records/assay";
import { parseWitaInput } from "@/core/lib/wita-time";
import type { Overwrite } from "@/modules/lab/lib/records/overwrite";

/**
 * How many samples still read better as a form than as a grid.
 *
 * Three cards fit a screen at once. Past that the stack grows longer than the
 * sideways scroll it was saving, and comparing a column down the rows -- what
 * a table is for -- starts to be worth more.
 */
export const FORM_UP_TO = 3;

export type Column = AssayField | InstrumentField | "remarks";

/** One row of the grid as the bulk save takes it. */
export function toPayload(id: string, row: RowValues): Record<string, string | number | null> {
  const record: Record<string, string | number | null> = { id };
  for (const field of ASSAY_FIELDS) {
    const raw = normaliseNumber(row[field.key]);
    record[field.key] = raw === "" ? null : Number(raw);
  }
  for (const field of INSTRUMENT_FIELDS) {
    const raw = row[field.key].trim();
    // An empty box means "not recorded" and has to reach the server as
    // null; sending "" would store an empty string as a measurement.
    record[field.key] =
      raw === "" ? null : field.kind === "datetime" ? (parseWitaInput(raw)?.toISOString() ?? null) : raw;
  }
  record.remarks = row.remarks.trim() || null;
  return record;
}

/** Results already there that a save would replace, per record. */
export interface Replaced {
  id: string;
  label: string;
  fields: Overwrite[];
}
export const ALL_COLUMNS: Column[] = [
  ...ASSAY_FIELDS.map((field) => field.key),
  ...INSTRUMENT_FIELDS.map((field) => field.key),
  "remarks",
];

/** The rows with only the replaced boxes put back to what was there. */
export function restoreReplaced(
  previous: Record<string, RowValues>,
  replacing: Replaced[],
  original: Record<string, RowValues>
): Record<string, RowValues> {
  const next = { ...previous };
  for (const entry of replacing) {
    const row = { ...next[entry.id] };
    for (const field of entry.fields) {
      row[field.field as CellField] = original[entry.id][field.field as CellField];
    }
    next[entry.id] = row;
  }
  return next;
}
