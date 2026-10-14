/** What the Lab module's routes send to the browser: samples, lab records, stages, master data. */
import type { MASTER_KINDS } from "@/modules/lab/validation/master";

export type SampleStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export interface StageDTO {
  id: string;
  /** Stable key the client translates; null on a stage added without one. */
  key: string | null;
  /** The stored wording, shown where no translation covers the key. */
  name: string;
  sequenceOrder: number;
  description: string | null;
}

export interface SampleListItemDTO {
  id: string;
  sampleCode: string;
  /** Flattened off the lab record, the way batchName used to be. */
  labCode: string | null;
  sampleIdent: string | null;
  status: SampleStatus;
  currentStageId: string | null;
  currentStage: StageDTO | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  labRecord?: LabRecordDTO | null;
}

export interface LabRecordDTO {
  id: string;
  /** Empty on a sub-sample, which belongs to its parent record instead. */
  sampleId: string | null;
  labCode: string;
  /** Shift day in "YYYY-MM-DD" form (the day runs 07:00-06:59 WITA). */
  shiftDate: string;
  /** Empty on a sub-sample: it takes no place in the day's run of codes. */
  sequence: number | null;
  /** On a sub-sample, the record it was taken from. */
  parentId: string | null;
  /** On a sub-sample, what sets it apart: "-20". */
  subCode: string | null;
  ni: number | null;
  fe: number | null;
  co: number | null;
  sio2: number | null;
  mgo: number | null;
  cao: number | null;
  al2o3: number | null;
  cr: number | null;
  fe2o3: number | null;
  cr2o3: number | null;
  mno: number | null;
  na2o: number | null;
  p2o5: number | null;
  tio2: number | null;
  s: number | null;
  co2: number | null;
  zn: number | null;
  sum: number | null;
  measurementMethod: string | null;
  solutionId: string | null;
  measurementFinished: string | null;
  /** The X-ray instrument it was read on: "S2 PUMA". */
  xrayInstrument: string | null;
  /** Moisture-content weighing, grams: pan, pan + wet sample, pan + dried sample. */
  wp: number | null;
  w0: number | null;
  wd: number | null;
  placeId: string | null;
  rockTypeId: string | null;
  nonProdId: string | null;
  pitId: string | null;
  sirId: string | null;
  bargingNo: string | null;
  sequenceNo: number | null;
  sampleNo: number | null;
  sackCount: number | null;
  /** Composed from the parts above; stored so it can be searched and matched. */
  sampleIdent: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of a pasted Wp/W0/Wd block, as the server found and checked it. */
export interface WeightsPreviewRow {
  line: number;
  key: string;
  status: "update" | "unchanged" | "unknown" | "ambiguous" | "invalid";
  message?: string;
  record?: { id: string; labCode: string; sampleIdent: string | null; sampleCode: string };
  from?: { wp: number | null; w0: number | null; wd: number | null };
  to?: { wp: number | null; w0: number | null; wd: number | null };
  /** The moisture content the weighing comes to, once applied. */
  mc?: number | null;
}

export interface WeightsPasteResult {
  rows: WeightsPreviewRow[];
  summary: { total: number; update: number; unchanged: number; unknown: number; invalid: number };
  saved: number;
}

export interface LabRecordAuditDTO {
  id: string;
  changedAt: string;
  changedBy: { id: string; name: string; email: string };
  changes: Record<string, { from: number | string | null; to: number | string | null }>;
  reason: string | null;
  /** Set when the change was to one of the sample's sub-samples. */
  subCode?: string | null;
}

/** One change to a record's results or identity, as the history screens show it. */
export interface RecordHistoryEntry {
  id: string;
  changedAt: string;
  changedBy: string;
  reason: string | null;
  /** Master options already read back as their codes. */
  changes: Record<string, { from: number | string | null; to: number | string | null }>;
  record: {
    id: string;
    labCode: string;
    sampleIdent: string | null;
    /** Set on a sub-sample: "-20". */
    subCode: string | null;
    /** The barcode it belongs to (a sub's parent's). */
    sampleCode: string | null;
  };
}

export interface LabRecordListItemDTO extends LabRecordDTO {
  /** A sub-sample shows its parent's: the same container. */
  sample: {
    id: string;
    sampleCode: string;
    status: SampleStatus;
    currentStage: StageDTO | null;
    /** Hours from its first Received scan to its last Report scan, once both happened. */
    leadTimeHours?: number | null;
  };
  /** On a parent, its sub-samples, listed beneath it. */
  subs?: LabRecordListItemDTO[];
}

export interface SampleLogDTO {
  id: string;
  sampleId: string;
  stageId: string;
  stage: StageDTO;
  operatorId: string;
  operator: { id: string; name: string; email: string };
  notes: string | null;
  isCorrection: boolean;
  scannedAt: string;
}

export interface SampleDetailDTO extends SampleListItemDTO {
  createdBy: { id: string; name: string; email: string };
  logs: SampleLogDTO[];
}

/** One list with the schema that accepts it (validation.ts), so the two cannot drift. */
export type MasterKind = (typeof MASTER_KINDS)[number];

export interface MasterOptionDTO {
  id: string;
  kind: MasterKind;
  code: string;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
  /**
   * How many samples already carry this code. Once it is above zero the code is
   * frozen: it sits inside every one of their Sample IDs, and renaming it here
   * would leave those ids saying something the master list no longer does.
   */
  usageCount?: number;
}

/** One hit of the quick search (Ctrl+K). */
export interface SampleLookupDTO {
  sampleCode: string;
  labCode: string | null;
  sampleIdent: string | null;
  status: SampleStatus;
  stageKey: string | null;
  stageName: string | null;
}

export interface ImportPreviewRow {
  line: number;
  /** The key the row was matched on: a lab code, or a Sample ID. */
  labCode: string;
  /** The barcode code of the sample it matched, when it matched one. */
  sampleCode?: string;
  /** "create": a sub-sample of a matched record, made when the import is applied. */
  status: "update" | "create" | "unchanged" | "unknown" | "invalid";
  changes: Record<string, { from: number | string | null; to: number | string | null }>;
  /** On a new sub-sample, its code: "-20". */
  subCode?: string;
  /** Results already there that this row would replace. */
  overwrites?: { field: string; from: number | string; to: number | string | null }[];
  message?: string;
  /**
   * On an invalid or unknown row, the column at fault ("ni", "sampleIdent"),
   * so a grid can mark the very cell rather than only the row.
   */
  field?: string;
  /** Other lines of this import whose results read exactly the same. */
  duplicateLines?: number[];
  /** Stored samples (Sample ID, or lab code) whose results read exactly the same. */
  duplicateOf?: string[];
}

export interface ImportPreviewDTO {
  rows: ImportPreviewRow[];
  summary: {
    total: number;
    update: number;
    create: number;
    unchanged: number;
    unknown: number;
    invalid: number;
    /** Rows that would replace results already there. */
    overwrite: number;
    /** Rows whose results read exactly like another row's or another sample's. */
    duplicate: number;
  };
  applied: boolean;
}
