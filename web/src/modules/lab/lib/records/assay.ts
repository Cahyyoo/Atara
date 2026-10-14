/**
 * The assay parameters stored for every sample, in the order the instrument
 * reports them — which is also the column order of the sheet operators paste
 * from. Shared by the table, the edit dialog, the paste mapper and both exports.
 */
export type AssayField =
  | "ni"
  | "fe"
  | "co"
  | "sio2"
  | "mgo"
  | "cao"
  | "al2o3"
  | "cr"
  | "fe2o3"
  | "cr2o3"
  | "mno"
  | "na2o"
  | "p2o5"
  | "tio2"
  | "s"
  | "co2"
  | "zn"
  | "sum";

export interface AssayFieldSpec {
  key: AssayField;
  /** Label for the edit form. */
  label: string;
  /** Compact label for table headers. */
  shortLabel: string;
  /** Plain-ASCII label for the CSV export and for matching pasted headers. */
  csvLabel: string;
  max: number;
}

export const ASSAY_FIELDS: AssayFieldSpec[] = [
  { key: "ni", label: "Ni (%)", shortLabel: "Ni", csvLabel: "Ni (%)", max: 100 },
  { key: "fe", label: "Fe (%)", shortLabel: "Fe", csvLabel: "Fe (%)", max: 100 },
  { key: "co", label: "Co (%)", shortLabel: "Co", csvLabel: "Co (%)", max: 100 },
  { key: "sio2", label: "SiO\u2082 (%)", shortLabel: "SiO\u2082", csvLabel: "SiO2 (%)", max: 100 },
  { key: "mgo", label: "MgO (%)", shortLabel: "MgO", csvLabel: "MgO (%)", max: 100 },
  { key: "cao", label: "CaO (%)", shortLabel: "CaO", csvLabel: "CaO (%)", max: 100 },
  { key: "al2o3", label: "Al\u2082O\u2083 (%)", shortLabel: "Al\u2082O\u2083", csvLabel: "Al2O3 (%)", max: 100 },
  { key: "cr", label: "Cr (%)", shortLabel: "Cr", csvLabel: "Cr (%)", max: 100 },
  { key: "fe2o3", label: "Fe\u2082O\u2083 (%)", shortLabel: "Fe\u2082O\u2083", csvLabel: "Fe2O3 (%)", max: 100 },
  { key: "cr2o3", label: "Cr\u2082O\u2083 (%)", shortLabel: "Cr\u2082O\u2083", csvLabel: "Cr2O3 (%)", max: 100 },
  { key: "mno", label: "MnO (%)", shortLabel: "MnO", csvLabel: "MnO (%)", max: 100 },
  { key: "na2o", label: "Na\u2082O (%)", shortLabel: "Na\u2082O", csvLabel: "Na2O (%)", max: 100 },
  { key: "p2o5", label: "P\u2082O\u2085 (%)", shortLabel: "P\u2082O\u2085", csvLabel: "P2O5 (%)", max: 100 },
  { key: "tio2", label: "TiO\u2082 (%)", shortLabel: "TiO\u2082", csvLabel: "TiO2 (%)", max: 100 },
  { key: "s", label: "S (%)", shortLabel: "S", csvLabel: "S (%)", max: 100 },
  { key: "co2", label: "CO\u2082 (%)", shortLabel: "CO\u2082", csvLabel: "CO2 (%)", max: 100 },
  { key: "zn", label: "Zn (%)", shortLabel: "Zn", csvLabel: "Zn (%)", max: 100 },
  // Reported by the instrument and stored as given, never recomputed: the
  // certificate has to carry the instrument's own figure.
  { key: "sum", label: "Sum", shortLabel: "Sum", csvLabel: "Sum", max: 1000 },
];

/**
 * The most decimal places a result is stored with (the columns are
 * DECIMAL(14,10)): trace elements such as Zn are reported as 0.0303.
 */
export const MAX_ASSAY_DECIMALS = 10;

/** Whether a number fits the columns' decimals, so MySQL would not round it away. */
export function fitsAssayDecimals(value: number): boolean {
  return Number(value.toFixed(MAX_ASSAY_DECIMALS)) === value;
}

/**
 * A result as stored, with no zeros trailing past `minDecimals`: 1.86 reads
 * "1.86" (or "1.860" at three), 0.0303 reads "0.0303" rather than "0.030".
 */
export function formatAssayValue(value: number, minDecimals: number): string {
  const full = value.toFixed(MAX_ASSAY_DECIMALS).replace(/0+$/, "");
  const decimals = full.split(".")[1]?.length ?? 0;
  return decimals >= minDecimals ? full.replace(/\.$/, "") : value.toFixed(minDecimals);
}

/**
 * The columns shown in the database table. Eighteen at once is unreadable on
 * any screen, so the rest stay behind the column picker and the edit dialog.
 */
export const ASSAY_TABLE_FIELDS: AssayField[] = ["ni", "fe", "sio2", "mgo", "co"];

/**
 * What the entry grid opens with: all of them.
 *
 * It used to borrow ASSAY_TABLE_FIELDS above, and those two lists answer
 * different questions. Five columns is right for a table somebody reads --
 * eighteen at once is unreadable, and the rest are a click away. It is wrong
 * for the one screen whose whole job is filling them in: thirteen of the
 * eighteen were simply absent, and getting to them meant knowing there was a
 * column picker at all.
 *
 * The three instrument columns and the remarks box stay off by default. Those
 * are not typed -- they arrive with a paste or an import -- so they would be
 * width spent on cells nobody is filling.
 */
export const ASSAY_ENTRY_FIELDS: AssayField[] = ASSAY_FIELDS.map((field) => field.key);

/**
 * What the instrument reports alongside the numbers.
 *
 * All three together. The previous list named only two of them, and the one it
 * left out was dropped from every paste without a word — the grid had no input
 * for it and the dialog had no reason to mention it.
 *
 * Labelled from the `database.<key>` messages, which already exist in both
 * locales: the record panel and the paste dialog name these columns from the
 * same keys.
 */
export const INSTRUMENT_FIELDS = [
  { key: "measurementMethod", kind: "text", csvLabel: "Measurement Method" },
  { key: "solutionId", kind: "text", csvLabel: "Solution ID" },
  { key: "measurementFinished", kind: "datetime", csvLabel: "Measurement Finished" },
  // Typed in by the analyst: the instrument's own export does not carry it,
  // which is why it is not in INSTRUMENT_EXPORT_ORDER below.
  { key: "xrayInstrument", kind: "text", csvLabel: "Xray Instrument" },
] as const satisfies readonly { key: string; kind: "text" | "datetime"; csvLabel: string }[];

export type InstrumentField = (typeof INSTRUMENT_FIELDS)[number]["key"];

/**
 * The order the instrument writes its columns in, which is the order they
 * arrive in when somebody selects a block in the sheet and copies it.
 *
 * Written down because the code used to assume it and assumed wrong. A block
 * pasted without its header row was read starting at Ni -- the comment on that
 * fallback even called it "the instrument's own column order" -- while the real
 * export opens with the timestamp. So the first cell, a date, was pushed into
 * the Ni column and every row was refused as an unreadable number.
 *
 * `measurementFinished` first and the two text columns last, with the eighteen
 * assay columns between them in exactly the order ASSAY_FIELDS already had.
 * That part was right; only the ends were missing.
 */
export const INSTRUMENT_EXPORT_ORDER = [
  "measurementFinished",
  ...ASSAY_FIELDS.map((field) => field.key),
  "measurementMethod",
  "solutionId",
] as const;

export const INSTRUMENT_FIELD_KEYS = INSTRUMENT_FIELDS.map(
  (field) => field.key
) as readonly InstrumentField[];
