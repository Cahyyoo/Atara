import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";

/**
 * The columns an export can carry, and which of them a request asked for.
 *
 * The exports used to be one fixed set of columns. Now the reader ticks what
 * goes in: whole groups at a time, or one column; and for every stage, when
 * the sample entered it, how long it stayed and who scanned it. A request
 * without a choice gets the columns it always got, so a saved link still
 * downloads the same sheet.
 *
 * Pure, so the screen that offers the choice and the route that honours it
 * read one list.
 */

/**
 * Where a column sits in the dialog and the sheet. "stages" is what goes
 * with the stage dates (the lead time); "mc" the moisture-content weighing.
 */
export type ExportColumnGroup = "sample" | "stages" | "identity" | "results" | "instrument" | "mc" | "other";

export interface ExportColumnSpec {
  key: string;
  group: ExportColumnGroup;
  /** As the sheet heads it; English, like every export the lab already reads. */
  header: string;
  width?: number;
  /** Part of the sheet a request without a choice gets. */
  defaultOn: boolean;
}

/** What each stage can contribute: when it was entered, for how long, by whom. */
export const STAGE_PARTS = ["at", "duration", "by"] as const;
export type StagePart = (typeof STAGE_PARTS)[number];

export function stageColumnKey(stageId: string, part: StagePart): string {
  return `stage.${stageId}.${part}`;
}

export function parseStageColumnKey(key: string): { stageId: string; part: StagePart } | null {
  const match = /^stage\.(.+)\.(at|duration|by)$/.exec(key);
  return match ? { stageId: match[1], part: match[2] as StagePart } : null;
}

export function stageColumnHeader(stageName: string, part: StagePart): string {
  if (part === "at") return `Entered ${stageName}`;
  return part === "duration" ? `Hours in ${stageName}` : `Preparator ${stageName}`;
}

/** The elements the Formulir Analysis Result reports; the rest can be ticked in. */
const FORM_ELEMENTS: ReadonlySet<string> = new Set(["ni", "fe", "co", "sio2", "mgo", "cao", "al2o3", "cr"]);

const ASSAY_COLUMNS: ExportColumnSpec[] = ASSAY_FIELDS.map((field) => ({
  key: field.key,
  group: "results",
  header: field.csvLabel,
  width: field.key === "sum" ? 9 : 8,
  defaultOn: FORM_ELEMENTS.has(field.key),
}));

/**
 * The Sample Database export, laid out as the lab's FORMULIR ANALYSIS RESULT:
 * the sample, the date it entered each stage and the lead time, the
 * elements with the SM ratio and moisture content worked out, who analysed it
 * on which instrument, and the moisture-content weighing (TABEL MC). Every
 * column can still be left out or others ticked in.
 */
export const LAB_RECORD_EXPORT_COLUMNS: ExportColumnSpec[] = [
  { key: "rowNo", group: "sample", header: "No.", width: 5, defaultOn: true },
  // Matched on when a sheet is pasted back, as "Sample" or "Sample ID".
  { key: "sampleIdent", group: "sample", header: "Sample", width: 34, defaultOn: true },
  { key: "labCode", group: "sample", header: "Lab Code", width: 24, defaultOn: false },
  { key: "sampleCode", group: "sample", header: "Barcode Code", width: 18, defaultOn: false },
  { key: "shiftDate", group: "sample", header: "Shift Date", width: 12, defaultOn: false },
  // Hours from the first scan into Received to the last into Report.
  { key: "leadTime", group: "stages", header: "Lead Time", width: 9, defaultOn: true },
  ...ASSAY_COLUMNS,
  { key: "smRatio", group: "results", header: "SM Ratio", width: 9, defaultOn: true },
  { key: "mc", group: "results", header: "MC", width: 8, defaultOn: true },
  { key: "measurementMethod", group: "instrument", header: "Application", width: 20, defaultOn: true },
  // The analyst whose account entered the results.
  { key: "preparator", group: "instrument", header: "Preparator", width: 14, defaultOn: true },
  { key: "xrayInstrument", group: "instrument", header: "Xray Instrument", width: 16, defaultOn: true },
  { key: "solutionId", group: "instrument", header: "Solution ID", width: 12, defaultOn: false },
  { key: "measurementFinished", group: "instrument", header: "Measurement Finished", width: 20, defaultOn: false },
  // The day of the weighing: the first scan into wet preparation.
  { key: "mcDate", group: "mc", header: "Tanggal", width: 15, defaultOn: true },
  { key: "wp", group: "mc", header: "Wp", width: 9, defaultOn: true },
  { key: "w0", group: "mc", header: "W0", width: 9, defaultOn: true },
  { key: "wd", group: "mc", header: "Wd", width: 9, defaultOn: true },
  { key: "place", group: "identity", header: "Place", width: 10, defaultOn: false },
  { key: "rockType", group: "identity", header: "Ore Class", width: 10, defaultOn: false },
  { key: "nonProd", group: "identity", header: "Non-prod", width: 10, defaultOn: false },
  { key: "sir", group: "identity", header: "SIR", width: 8, defaultOn: false },
  { key: "pit", group: "identity", header: "Pit", width: 8, defaultOn: false },
  { key: "bargingNo", group: "identity", header: "Barging", width: 10, defaultOn: false },
  { key: "sequenceNo", group: "identity", header: "Sample No", width: 10, defaultOn: false },
  { key: "sampleNo", group: "identity", header: "Quality No", width: 10, defaultOn: false },
  { key: "sackCount", group: "identity", header: "Sacks", width: 8, defaultOn: false },
  { key: "currentStage", group: "other", header: "Current Stage", width: 16, defaultOn: false },
  { key: "status", group: "other", header: "Status", width: 12, defaultOn: false },
  { key: "remarks", group: "other", header: "Remarks", width: 30, defaultOn: false },
  { key: "updatedAt", group: "other", header: "Last Updated", width: 22, defaultOn: false },
];

/** The Dashboard's sample list: one row per barcode. */
export const SAMPLE_EXPORT_COLUMNS: ExportColumnSpec[] = [
  { key: "sampleCode", group: "sample", header: "Barcode Code", width: 18, defaultOn: true },
  { key: "labCode", group: "sample", header: "Lab Code", width: 24, defaultOn: true },
  { key: "sampleIdent", group: "sample", header: "Sample ID", width: 30, defaultOn: true },
  { key: "currentStage", group: "sample", header: "Current Stage", width: 18, defaultOn: true },
  { key: "status", group: "sample", header: "Status", width: 14, defaultOn: true },
  { key: "createdBy", group: "other", header: "Created By", width: 18, defaultOn: true },
  { key: "createdAt", group: "other", header: "Created At", width: 24, defaultOn: true },
  { key: "updatedAt", group: "other", header: "Last Updated", width: 24, defaultOn: true },
];

export const EXPORT_CATALOGUES = {
  labRecords: LAB_RECORD_EXPORT_COLUMNS,
  samples: SAMPLE_EXPORT_COLUMNS,
} as const;
export type ExportKind = keyof typeof EXPORT_CATALOGUES;

/**
 * How each export lays out its stage columns. The form puts every stage's
 * date side by side under one heading, then the hours and preparators; the
 * sample list keeps each stage's three together. And which a reader starts on.
 */
export interface StageLayout {
  byPart: boolean;
  defaultParts: readonly StagePart[];
}
export const EXPORT_STAGE_LAYOUT: Record<ExportKind, StageLayout> = {
  labRecords: { byPart: true, defaultParts: ["at"] },
  samples: { byPart: false, defaultParts: ["at", "duration"] },
};

/** Every key the export can carry, in sheet order: the sample, its stages, then the rest. */
export function exportKeyOrder(
  catalogue: readonly ExportColumnSpec[],
  stageIds: readonly string[],
  { byPart = false }: { byPart?: boolean } = {}
): string[] {
  const stageKeys = byPart
    ? STAGE_PARTS.flatMap((part) => stageIds.map((stageId) => stageColumnKey(stageId, part)))
    : stageIds.flatMap((stageId) => STAGE_PARTS.map((part) => stageColumnKey(stageId, part)));
  const inGroup = (group: ExportColumnGroup) =>
    catalogue.filter((column) => column.group === group).map((column) => column.key);
  const rest = catalogue
    .filter((column) => column.group !== "sample" && column.group !== "stages")
    .map((column) => column.key);
  return [...inGroup("sample"), ...stageKeys, ...inGroup("stages"), ...rest];
}

/** What a reader starts on: the columns marked default, plus the stage parts the export starts with. */
export function defaultExportSelection(
  catalogue: readonly ExportColumnSpec[],
  stageIds: readonly string[],
  parts: readonly StagePart[] = ["at", "duration"]
): string[] {
  return [
    ...catalogue.filter((column) => column.defaultOn).map((column) => column.key),
    ...stageIds.flatMap((stageId) => parts.map((part) => stageColumnKey(stageId, part))),
  ];
}

/**
 * The columns a request asked for, `columns=key,key,...`, in sheet order. No
 * choice at all is the sheet the export always gave. Keys it does not know --
 * a stage since removed, a column misspelled -- are dropped, never an error.
 */
export function parseExportColumns(
  raw: string | null,
  catalogue: readonly ExportColumnSpec[],
  stageIds: readonly string[],
  layout: { byPart?: boolean } = {}
): string[] {
  if (raw === null) return catalogue.filter((column) => column.defaultOn).map((column) => column.key);
  const asked = new Set(raw.split(",").map((key) => key.trim()).filter(Boolean));
  return exportKeyOrder(catalogue, stageIds, layout).filter((key) => asked.has(key));
}

/** The sheet's columns for the chosen keys: the catalogue's own, and each stage's under its name. */
export function sheetColumnsFor(
  keys: readonly string[],
  catalogue: readonly ExportColumnSpec[],
  stages: readonly { id: string; name: string }[]
): { header: string; key: string; width?: number }[] {
  const byKey = new Map(catalogue.map((column) => [column.key, column]));
  const stageName = new Map(stages.map((stage) => [stage.id, stage.name]));
  return keys.flatMap((key) => {
    const spec = byKey.get(key);
    if (spec) return [{ header: spec.header, key, width: spec.width }];
    const stage = parseStageColumnKey(key);
    const name = stage ? stageName.get(stage.stageId) : undefined;
    return stage && name ? [{ header: stageColumnHeader(name, stage.part), key, width: stage.part === "at" ? 20 : 14 }] : [];
  });
}

/** One row's stage cells for the chosen keys, from the sample's timeline. */
export function stageCells(
  keys: readonly string[],
  visits: ReadonlyMap<string, { at: Date; hours: number | null; by: string | null }>,
  formatAt: (at: Date) => string | null
): Record<string, string | number | null> {
  const cells: Record<string, string | number | null> = {};
  for (const key of keys) {
    const stage = parseStageColumnKey(key);
    if (!stage) continue;
    const visit = visits.get(stage.stageId);
    cells[key] = !visit
      ? null
      : stage.part === "at"
        ? formatAt(visit.at)
        : stage.part === "duration"
          ? visit.hours
          : visit.by;
  }
  return cells;
}
