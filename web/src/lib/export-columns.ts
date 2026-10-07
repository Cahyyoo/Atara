import { ASSAY_FIELDS } from "@/lib/assay";

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

export type ExportColumnGroup = "sample" | "identity" | "results" | "instrument" | "other";

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
  return part === "duration" ? `Hours in ${stageName}` : `Operator ${stageName}`;
}

const ASSAY_COLUMNS: ExportColumnSpec[] = ASSAY_FIELDS.map((field) => ({
  key: field.key,
  group: "results",
  header: field.csvLabel,
  width: 13,
  defaultOn: true,
}));

/** The Sample Database export: one row per lab record. */
export const LAB_RECORD_EXPORT_COLUMNS: ExportColumnSpec[] = [
  { key: "labCode", group: "sample", header: "Lab Code", width: 24, defaultOn: true },
  // The column a pasted block is matched on, so an exported sheet can be
  // filled in and pasted straight back. Without it the round trip breaks.
  { key: "sampleIdent", group: "sample", header: "Sample ID", width: 30, defaultOn: true },
  { key: "sampleCode", group: "sample", header: "Barcode Code", width: 18, defaultOn: true },
  { key: "shiftDate", group: "sample", header: "Shift Date", width: 14, defaultOn: true },
  { key: "currentStage", group: "sample", header: "Current Stage", width: 18, defaultOn: true },
  { key: "status", group: "sample", header: "Status", width: 14, defaultOn: true },
  { key: "place", group: "identity", header: "Place", width: 12, defaultOn: false },
  { key: "rockType", group: "identity", header: "Ore Class", width: 12, defaultOn: false },
  { key: "nonProd", group: "identity", header: "Non-prod", width: 12, defaultOn: false },
  { key: "sir", group: "identity", header: "SIR", width: 10, defaultOn: false },
  { key: "pit", group: "identity", header: "Pit", width: 10, defaultOn: false },
  { key: "bargingNo", group: "identity", header: "Barging", width: 12, defaultOn: false },
  { key: "sequenceNo", group: "identity", header: "Running No", width: 12, defaultOn: false },
  { key: "sampleNo", group: "identity", header: "Sample No", width: 12, defaultOn: false },
  { key: "sackCount", group: "identity", header: "Sacks", width: 10, defaultOn: false },
  ...ASSAY_COLUMNS,
  { key: "measurementMethod", group: "instrument", header: "Measurement Method", width: 22, defaultOn: true },
  { key: "solutionId", group: "instrument", header: "Solution ID", width: 14, defaultOn: true },
  { key: "measurementFinished", group: "instrument", header: "Measurement Finished", width: 22, defaultOn: true },
  { key: "remarks", group: "other", header: "Remarks", width: 32, defaultOn: true },
  { key: "updatedAt", group: "other", header: "Last Updated", width: 24, defaultOn: true },
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

/** Every key the export can carry, in sheet order: the sample, its stages, then the rest. */
export function exportKeyOrder(catalogue: readonly ExportColumnSpec[], stageIds: readonly string[]): string[] {
  const stageKeys = stageIds.flatMap((stageId) => STAGE_PARTS.map((part) => stageColumnKey(stageId, part)));
  const sample = catalogue.filter((column) => column.group === "sample").map((column) => column.key);
  const rest = catalogue.filter((column) => column.group !== "sample").map((column) => column.key);
  return [...sample, ...stageKeys, ...rest];
}

/** What a reader starts on: the old sheet, plus when each stage was entered and for how long. */
export function defaultExportSelection(
  catalogue: readonly ExportColumnSpec[],
  stageIds: readonly string[]
): string[] {
  return [
    ...catalogue.filter((column) => column.defaultOn).map((column) => column.key),
    ...stageIds.flatMap((stageId) => [stageColumnKey(stageId, "at"), stageColumnKey(stageId, "duration")]),
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
  stageIds: readonly string[]
): string[] {
  if (raw === null) return catalogue.filter((column) => column.defaultOn).map((column) => column.key);
  const asked = new Set(raw.split(",").map((key) => key.trim()).filter(Boolean));
  return exportKeyOrder(catalogue, stageIds).filter((key) => asked.has(key));
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
