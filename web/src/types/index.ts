export type SampleStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
import type { Role } from "@/lib/permissions";
import type { DeviceInfo } from "@/lib/session-client";

/** The four roles; what each may do is in permissions.ts. */
export type UserRole = Role;

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

export type MasterKind = "PLACE" | "ROCK_TYPE" | "NON_PROD" | "PIT" | "SIR";

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

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  /** Set while the account is locked out after failed sign-ins. */
  lockedUntil: string | null;
  createdAt: string;
  /** How many face readings are enrolled; never the readings themselves. */
  _count?: { faceEnrollments: number };
  /** An admin asked for an authenticator app; set up at the next sign-in. */
  totpRequestedAt: string | null;
  /** When the authenticator app was set up; null while off or still pending. */
  totpEnabledAt: string | null;
  /** The password an administrator set; the person replaces it at their next sign-in. */
  mustChangePassword?: boolean;
}

/** A banner above every page; see announcements.ts. */
export interface AnnouncementDTO {
  id: string;
  message: string;
  tone: "INFO" | "WARNING";
  /** Null for everybody. */
  roles: UserRole[] | null;
  startsAt: string;
  endsAt: string | null;
  createdBy: string | null;
  createdAt: string;
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

/** One signed-in device of an account, as the admin's sessions list shows it. */
export interface UserSessionDTO {
  id: string;
  client: "WEB" | "MOBILE";
  device: string | null;
  deviceInfo: DeviceInfo | null;
  address: string | null;
  createdAt: string;
  endedAt: string | null;
  endedReason: "REPLACED" | "LOGOUT" | "ADMIN_ENDED" | "PASSWORD_CHANGED" | null;
  /** The administrator's own session, which the list does not offer to end. */
  isCurrent: boolean;
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
  };
  applied: boolean;
}

export interface PaginationDTO {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
  details?: unknown;
  /** Machine-readable tag, when the route gives one (see ApiError). */
  code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
