/**
 * Which column of a pasted block or an imported sheet is which: by its header
 * when it has one, by its position (the instrument's order) when it does not.
 */
import {
  ASSAY_FIELDS,
  INSTRUMENT_EXPORT_ORDER,
  INSTRUMENT_FIELDS,
  type AssayField,
} from "@/modules/lab/lib/records/assay";
import { normaliseHeader } from "@/core/lib/sheets/csv-parse";
import { parseSheetDateTime } from "@/modules/lab/lib/records/measurement-time";

export type PasteField = AssayField | "measurementMethod" | "solutionId" | "xrayInstrument" | "remarks";

/** Columns that identify a row rather than carry a value to write. */
export type MatchField = "sampleIdent" | "labCode" | "measurementFinished";

export type Column = { index: number } & ({ kind: "value"; key: PasteField } | { kind: "match"; key: MatchField });

const MATCH_HEADERS: Record<string, MatchField> = {
  sampleid: "sampleIdent",
  sampleident: "sampleIdent",
  // How the Formulir Analysis Result heads it.
  sample: "sampleIdent",
  idsampel: "sampleIdent",
  labcode: "labCode",
  kodelab: "labCode",
  measurementfinished: "measurementFinished",
  selesaidiukur: "measurementFinished",
};

const META_HEADERS: Record<string, PasteField> = {
  measurementmethod: "measurementMethod",
  metodepengukuran: "measurementMethod",
  solutionid: "solutionId",
  idlarutan: "solutionId",
  xrayinstrument: "xrayInstrument",
  instrumentxray: "xrayInstrument",
  xray: "xrayInstrument",
  instrument: "xrayInstrument",
  instrumen: "xrayInstrument",
  remarks: "remarks",
  catatan: "remarks",
  keterangan: "remarks",
};

/** Columns whose cell is taken as written rather than read as a number. */
export const TEXT_FIELDS: ReadonlySet<PasteField> = new Set<PasteField>([
  // Only the text-valued ones: measurementFinished is a `match` column, read
  // as a wall clock rather than taken as written.
  ...INSTRUMENT_FIELDS.filter((field) => field.kind === "text").map((field) => field.key),
  "remarks",
]);

/**
 * What a column heading names, or null for one we do not store.
 *
 * Shared with the CSV import so a sheet exported from here means the same thing
 * whether it is pasted or uploaded — two lists of headings would drift, and the
 * symptom would be an edited column silently doing nothing.
 */
export function fieldForHeader(
  cell: string
): { kind: "value"; key: PasteField } | { kind: "match"; key: MatchField } | null {
  const normalised = normaliseHeader(cell);
  if (!normalised) return null;

  const assay = ASSAY_FIELDS.find((field) => normaliseHeader(field.key) === normalised);
  if (assay) return { kind: "value", key: assay.key };

  const meta = META_HEADERS[normalised];
  if (meta) return { kind: "value", key: meta };

  const match = MATCH_HEADERS[normalised];
  if (match) return { kind: "match", key: match };

  return null;
}

function columnFor(cell: string, index: number): Column | null {
  const field = fieldForHeader(cell);
  return field === null ? null : { index, ...field };
}

/**
 * A header row is one where enough cells name columns we own. Two is the
 * threshold: a single hit could be a stray word in a data row, and a real
 * header from this sheet names a dozen.
 */
export function readHeader(row: string[]): Column[] | null {
  const columns = row.map((cell, index) => columnFor(cell, index)).filter((column) => column !== null);
  return columns.length >= 2 ? columns : null;
}

/**
 * Without a header, cells are read by position -- and there are two layouts
 * worth recognising.
 *
 * The instrument's export opens with the timestamp and closes with the method
 * and the solution id, with the eighteen assay columns between them. This used
 * to assume the block began at Ni, and called that "the instrument's own column
 * order" while being wrong about it: a block copied straight out of the sheet
 * put its date into the Ni column and every row was refused.
 *
 * The other layout is the assay numbers on their own, which is what somebody
 * selecting only the results columns produces, and it still works.
 *
 * Which one is decided by reading the block rather than by guessing at it. The
 * two can never be confused: "3/16/2026 10:34" is not a number any reading,
 * and "2.03" is not a date -- one separator where a date needs two.
 */
export function positionalColumns(rows: string[][], width: number): Column[] {
  const firstCell = (rows[0]?.[0] ?? "").trim();
  const startsWithTime = firstCell !== "" && parseSheetDateTime(firstCell) !== null;

  if (!startsWithTime) {
    return ASSAY_FIELDS.slice(0, width).map((field, index) => ({
      index,
      kind: "value" as const,
      key: field.key,
    }));
  }

  // Sliced to the block, so selecting part of the sheet -- the timestamp
  // through to Sum, say -- reads as far as it goes and no further.
  return INSTRUMENT_EXPORT_ORDER.slice(0, width).map((key, index) =>
    key === "measurementFinished"
      ? { index, kind: "match" as const, key }
      : { index, kind: "value" as const, key: key as PasteField }
  );
}
