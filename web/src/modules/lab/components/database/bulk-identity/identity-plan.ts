import type { LabRecordListItemDTO, MasterKind } from "@/modules/lab/types";

/**
 * From this many Sample IDs on, the dialog starts on one form for all of
 * them -- changing a pit in forty forms is not what anyone wants -- and the
 * list of Sample IDs gets a search and an "only changed" filter.
 */
export const COMPACT_FROM = 6;

export type PickerKey = "placeId" | "rockTypeId" | "nonProdId" | "sirId" | "pitId";
export type TextKey = "bargingNo" | "sequenceNo" | "sampleNo" | "sackCount";
export type FieldKey = PickerKey | TextKey;

/** The identity columns, in the order the Sample ID reads them. */
export const PICKERS: { key: PickerKey; kind: MasterKind }[] = [
  { key: "placeId", kind: "PLACE" },
  { key: "rockTypeId", kind: "ROCK_TYPE" },
  { key: "nonProdId", kind: "NON_PROD" },
  { key: "sirId", kind: "SIR" },
  { key: "pitId", kind: "PIT" },
];
export const TEXTS: { key: TextKey; numeric: boolean }[] = [
  { key: "bargingNo", numeric: false },
  { key: "sequenceNo", numeric: true },
  { key: "sampleNo", numeric: true },
  { key: "sackCount", numeric: true },
];
const FIELD_KEYS: FieldKey[] = [...PICKERS.map((field) => field.key), ...TEXTS.map((field) => field.key)];

/** A picker set to nothing, and a picker left on "these differ". */
export const NONE = "__none__";
export const MIXED = "__mixed__";

const isPicker = (key: FieldKey) => PICKERS.some((field) => field.key === key);
const isNumeric = (key: FieldKey) => TEXTS.some((field) => field.key === key && field.numeric);

export interface Preview {
  preview: { sampleCode: string; labCode: string; from: string | null; to: string | null }[];
  more: number;
  clashes: string[];
  changed: number;
}

/** What the chosen records hold in one column now: one value, none, or several. */
export function summarizeCurrent(
  values: (string | number | null)[],
  label: (value: string | number) => string
): { kind: "empty" } | { kind: "one"; value: string } | { kind: "mixed"; values: string[]; hasEmpty: boolean } {
  const present = [...new Set(values.filter((value): value is string | number => value !== null && value !== ""))];
  const hasEmpty = values.some((value) => value === null || value === "");
  if (present.length === 0) return { kind: "empty" };
  if (present.length === 1 && !hasEmpty) return { kind: "one", value: label(present[0]) };
  return { kind: "mixed", values: present.map(label), hasEmpty };
}

export interface Group {
  ident: string | null;
  records: LabRecordListItemDTO[];
}

/**
 * One form per Sample ID: each record that has one is edited on its own,
 * and the records without one -- a batch of fresh barcodes -- together. In
 * table order, by where each group's first record sits.
 */
export function groupBySampleIdent(records: LabRecordListItemDTO[]): Group[] {
  const groups: Group[] = [];
  const byIdent = new Map<string | null, Group>();
  for (const record of records) {
    const ident = record.sampleIdent || null;
    const group = byIdent.get(ident);
    if (group) group.records.push(record);
    else {
      const created = { ident, records: [record] };
      byIdent.set(ident, created);
      groups.push(created);
    }
  }
  return groups;
}

function isWholeNumber(value: string) {
  return /^\d+$/.test(value.trim());
}

/** What one field asks for, judged against where it started. */
export type Status = "keep" | "set" | "clear" | "invalid";
export type Initial = Record<FieldKey, { start: string; mixed: boolean }>;
export interface GroupState {
  values: Record<FieldKey, string>;
  /** Several records: number them in table order from the sample number typed. */
  sequential: boolean;
}
export type GroupUpdate = (index: number, update: (state: GroupState) => GroupState) => void;

/** How the list on the left marks a form: how many fields changed, and whether one is wrong. */
export interface Mark {
  touched: number;
  invalid: boolean;
}

/** Where each field starts: the value the records share, empty, or "mixed". */
export function initialOf(records: LabRecordListItemDTO[]): Initial {
  return Object.fromEntries(
    FIELD_KEYS.map((key) => {
      const summary = summarizeCurrent(
        records.map((record) => record[key] ?? null),
        (value) => String(value)
      );
      const mixed = summary.kind === "mixed";
      const start = summary.kind === "one" ? summary.value : isPicker(key) ? (mixed ? MIXED : NONE) : "";
      return [key, { start, mixed }];
    })
  ) as Initial;
}

export function freshState(initial: Initial): GroupState {
  return {
    values: Object.fromEntries(FIELD_KEYS.map((key) => [key, initial[key].start])) as Record<FieldKey, string>,
    sequential: true,
  };
}

export function fieldStatus(key: FieldKey, raw: string, start: string, mixed: boolean): Status {
  const value = raw.trim();
  if (value === start) return "keep";
  if (isPicker(key)) return value === NONE ? "clear" : value === MIXED ? "keep" : "set";
  // An empty box over records that differ means "leave them be"; over
  // records that agree, it means "empty it".
  if (value === "") return mixed ? "keep" : "clear";
  return isNumeric(key) && !isWholeNumber(value) ? "invalid" : "set";
}

/** What one form asks of its records: only the fields that differ from where they started. */
export function groupRequest(records: LabRecordListItemDTO[], initial: Initial, state: GroupState) {
  const statuses = Object.fromEntries(
    FIELD_KEYS.map((key) => [key, fieldStatus(key, state.values[key], initial[key].start, initial[key].mixed)])
  ) as Record<FieldKey, Status>;
  const touched = FIELD_KEYS.filter((key) => statuses[key] !== "keep").length;
  const invalid = FIELD_KEYS.some((key) => statuses[key] === "invalid");
  const numberInOrder = records.length > 1 && state.sequential && statuses.sampleNo === "set";
  const set = Object.fromEntries(
    FIELD_KEYS.filter((key) => statuses[key] === "set" && !(key === "sampleNo" && numberInOrder)).map((key) => {
      const value = state.values[key].trim();
      return [key, isNumeric(key) ? Number(value) : value];
    })
  );
  const clear = FIELD_KEYS.filter((key) => statuses[key] === "clear");
  const sampleNoStart = numberInOrder ? Number(state.values.sampleNo) : null;
  const changes = Object.keys(set).length > 0 || clear.length > 0 || sampleNoStart !== null;
  return {
    touched,
    invalid,
    request: changes ? { ids: records.map((record) => record.id), set, clear, sampleNoStart } : null,
  };
}
