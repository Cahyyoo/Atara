import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import type { PasteRow, PasteTarget } from "@/modules/lab/lib/records/paste-map";
import type { Overwrite } from "@/modules/lab/lib/records/overwrite";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import type { LabRecordListItemDTO } from "@/modules/lab/types";

/** One save is one transaction, matching the limit the bulk endpoint enforces. */
export const MAX_ROWS = 200;

/** The most keys one look-up takes, matching the resolve endpoint. */
export const MAX_KEYS = 500;

/** A pause in typing long enough to look the pasted Sample IDs up. */
export const RESOLVE_DEBOUNCE_MS = 300;

/**
 * The stored instant is an ISO string, but an operator reads a wall clock —
 * the lab's own, which is WITA, not whatever this browser is set to. Showing it
 * that way is what makes a date read the wrong way round visible before it is
 * saved.
 */
export function formatChange(key: string, value: number | string | null): string {
  if (value === null || value === "") return "—";
  if (key !== "measurementFinished") return String(value);

  return formatWitaDateTime(String(value)) ?? String(value);
}

/**
 * Messages the mapper sends as a key rather than as prose, so they can be
 * translated. Anything else is text meant to be read as written.
 */
export const REASON_KEYS = new Set(["noMatch", "notFound", "ambiguous", "noRow", "duplicate", "futureDate"]);

/** What the mapper needs of a record: how to recognise it, and what it holds now. */
export function toTarget(record: Omit<LabRecordListItemDTO, "sample" | "subs">): PasteTarget {
  const values: PasteTarget["values"] = {
    measurementMethod: record.measurementMethod,
    solutionId: record.solutionId,
    measurementFinished: record.measurementFinished,
    remarks: record.remarks,
  };
  for (const field of ASSAY_FIELDS) {
    values[field.key] = record[field.key];
  }

  return {
    id: record.id,
    labCode: record.labCode,
    sampleIdent: record.sampleIdent,
    parentId: record.parentId,
    sackCount: record.sackCount,
    values,
  };
}

export type Resolution =
  | { key: string; status: "found"; record: LabRecordListItemDTO }
  | { key: string; status: "newSub"; parent: LabRecordListItemDTO; code: string }
  | { key: string; status: "ambiguous" }
  | { key: string; status: "unknown" };

/** Results already there that a save would replace, per record. */
export interface OverwriteEntry {
  targetId: string | null;
  label: string;
  fields: Overwrite[];
}

/** The rows as the bulk endpoint takes them. */
export function payload(rows: PasteRow[], keep: OverwriteEntry[] | null) {
  return rows.flatMap((row) => {
    // "Save without replacing": each record keeps what it already holds.
    const skip = new Set(keep?.find((entry) => entry.targetId === row.targetId)?.fields.map((field) => field.field));
    const values = Object.fromEntries(Object.entries(row.values).filter(([key]) => !skip.has(key)));
    if (Object.keys(values).length === 0) return [];
    return [row.sub ? { parentId: row.sub.parentId, subCode: row.sub.code, ...values } : { id: row.targetId, ...values }];
  });
}
