/**
 * Maps a block copied out of a spreadsheet onto the lab records the operator
 * selected first.
 *
 * Kept a pure function, like `composeSampleIdent`, so the rules that decide
 * which cell lands in which column — and which pasted row belongs to which
 * record — can be checked without a clipboard, a database or a form.
 */
import { normalizeSampleKey, sampleIdentKeys } from "@/modules/lab/lib/samples/sample-ident";
import { findOverwrites, type Overwrite } from "@/modules/lab/lib/records/overwrite";
import { parseNumber } from "@/core/lib/number-parse";
import {
  PasteField,
  TEXT_FIELDS,
  readHeader,
  positionalColumns,
  type Column,
} from "@/modules/lab/lib/records/paste-columns";
import { readMeasurementFinished } from "@/modules/lab/lib/records/measurement-time";

export interface PasteTarget {
  id: string;
  labCode: string;
  sampleIdent: string | null;
  /** Set on a sub-sample; a sub cannot have subs of its own. */
  parentId?: string | null;
  /** So a Sample ID pasted without the sack count still finds the record. */
  sackCount?: number | null;
  /** Current values, so the preview can say what each cell changes from. */
  values: Partial<Record<PasteField | "measurementFinished", number | string | null>>;
}

/** "create": a sub-sample of a matched record, made when the paste is applied. */
export type PasteStatus = "update" | "create" | "unchanged" | "unknown" | "invalid";

export interface PasteChange {
  from: number | string | null;
  to: number | string | null;
}

export interface PasteRow {
  /** 1-based position in the pasted block, as the operator sees it. */
  line: number;
  /** What identifies the record this row landed on, or the raw cell if none did. */
  label: string;
  status: PasteStatus;
  message?: string;
  targetId: string | null;
  /** On a new sub-sample: the record it is taken from, and its code. */
  sub?: { parentId: string; code: string };
  changes: Record<string, PasteChange>;
  /** Results already there that this row would replace. */
  overwrites?: Overwrite[];
  /** The payload for PATCH /api/lab-records/bulk; empty unless status is "update" or "create". */
  values: Record<string, number | string | null>;
}

export interface PasteResult {
  rows: PasteRow[];
  /** How rows were paired with records: by Sample ID, or by order as the fallback. */
  matchedBy: "ident" | "order";
  /**
   * The heading of the column the Sample IDs were read from. "labCode" when
   * the sheet calls it Lab Code -- read as the Sample ID all the same.
   */
  keyHeader: "sampleIdent" | "labCode" | null;
  /** True when the block carried a header row, which was then not treated as data. */
  hasHeader: boolean;
  columns: PasteField[];
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
  /** Set when the whole block must be refused; nothing is sent while it is. */
  blocker: { kind: "count"; pasted: number; selected: number } | { kind: "noColumns" } | null;
}

type StoredKey = keyof PasteTarget["values"];

function comparable(value: number | string | null | undefined): number | string | null {
  return value ?? null;
}

/**
 * The column a block's rows are matched on: the one headed Sample ID, or --
 * the lab's sheets put the Sample ID there -- one headed Lab Code. Either is
 * read as a Sample ID; Lab Codes themselves are not matched on.
 */
function keyColumnOf(columns: Column[]): { column: Column; header: "sampleIdent" | "labCode" } | null {
  const ident = columns.find((column) => column.kind === "match" && column.key === "sampleIdent");
  if (ident) return { column: ident, header: "sampleIdent" };
  const labCode = columns.find((column) => column.kind === "match" && column.key === "labCode");
  return labCode ? { column: labCode, header: "labCode" } : null;
}

/**
 * The Sample IDs a pasted block names, read from its header, so they can be
 * looked up across every record before the block is mapped -- the paste that
 * needs no ticking. Null when the block has no key column.
 */
export function pastedKeys(rows: string[][]): { keys: string[] } | null {
  if (rows.length === 0) return null;
  const header = readHeader(rows[0]);
  const key = header ? keyColumnOf(header) : null;
  if (!key) return null;
  const keys = [...new Set(rows.slice(1).map((row) => (row[key.column.index] ?? "").trim()).filter(Boolean))];
  return { keys };
}

export function mapPastedRows(
  rows: string[][],
  targets: PasteTarget[],
  /** Injected so the future-date guard can be tested without a fake clock. */
  now: Date = new Date(),
  {
    subs: allowSubs = true,
    scope = "selected",
    ambiguous = [],
  }: {
    /**
     * False where a new sub-sample cannot be made -- filling the entry grid,
     * whose rows are records that already exist.
     */
    subs?: boolean;
    /** "all": the targets were looked up across every record, not ticked. */
    scope?: "selected" | "all";
    /** Sample IDs that fit more than one record once the sack count is left out. */
    ambiguous?: readonly string[];
  } = {}
): PasteResult {
  const empty: PasteResult["summary"] = {
    total: 0,
    update: 0,
    create: 0,
    unchanged: 0,
    unknown: 0,
    invalid: 0,
    overwrite: 0,
  };
  if (rows.length === 0) {
    return {
      rows: [],
      matchedBy: "order",
      keyHeader: null,
      hasHeader: false,
      columns: [],
      summary: empty,
      blocker: null,
    };
  }

  const header = readHeader(rows[0]);
  const hasHeader = header !== null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const width = Math.max(...rows.map((row) => row.length));
  const columns = header ?? positionalColumns(rows, width);

  const valueColumns = columns.filter((column) => column.kind === "value");
  if (valueColumns.length === 0) {
    return {
      rows: [],
      matchedBy: "order",
      keyHeader: null,
      hasHeader,
      columns: [],
      summary: empty,
      blocker: { kind: "noColumns" },
    };
  }

  // Matching on an id beats matching on position: the operator can select rows
  // in any order, and a sheet sorted differently would otherwise write every
  // result onto the wrong sample.
  const keyColumn = keyColumnOf(columns);
  const finishedColumn = columns.find(
    (column) => column.kind === "match" && column.key === "measurementFinished"
  );

  const matchedBy = keyColumn ? "ident" : "order";
  const matchColumn = keyColumn?.column ?? null;

  // Read the way the server reads them: in a Sample ID a space and a slash are
  // the same separator, a bracketed code after an id names a sub-sample, and
  // the sack count at the end may be left out.
  const keyOf = (raw: string) => normalizeSampleKey(raw);
  const byKey = new Map<string, PasteTarget>();
  const clashing = new Set<string>(ambiguous.map((key) => keyOf(key).full));
  for (const target of targets) {
    for (const key of sampleIdentKeys(target.sampleIdent, target.sackCount)) {
      const held = byKey.get(key);
      // Two records that differ only in their sacks: which one is meant
      // cannot be told, so neither is guessed.
      if (held && held.id !== target.id) clashing.add(key);
      else byKey.set(key, target);
    }
  }

  // Positional matching only makes sense when the two sides line up exactly;
  // anything else would silently shift every result down a row.
  const blocker =
    matchedBy === "order" && dataRows.length !== targets.length
      ? ({ kind: "count", pasted: dataRows.length, selected: targets.length } as const)
      : null;

  const used = new Set<string>();

  const mapped = dataRows.map((row, index): PasteRow => {
    const line = index + 1;
    const rawKey = matchColumn ? (row[matchColumn.index] ?? "").trim() : "";
    const key = matchColumn ? keyOf(rawKey) : null;

    if (key && (clashing.has(key.full) || (key.code && !byKey.has(key.full) && clashing.has(key.base)))) {
      return { line, label: rawKey, status: "invalid", targetId: null, changes: {}, values: {}, message: "ambiguous" };
    }

    const found = key ? byKey.get(key.full) : targets[index];
    // "LAM/SAP/S4/B24/3475.3 (-20)" with no such sub yet, under a sample that
    // is here: a new sub-sample of it.
    const parent = !found && key?.code ? byKey.get(key.base) : undefined;
    const sub =
      allowSubs && parent && !parent.parentId && key?.code ? { parentId: parent.id, code: key.code } : undefined;
    const target = found ?? (sub ? parent : undefined);
    const label = rawKey || target?.sampleIdent || target?.labCode || "";

    if (!target) {
      return {
        line,
        label,
        status: "unknown",
        targetId: null,
        changes: {},
        values: {},
        message: !matchColumn ? "noRow" : scope === "all" ? "notFound" : "noMatch",
      };
    }

    const usedKey = sub ? `${sub.parentId} (${sub.code})` : target.id;
    if (used.has(usedKey)) {
      return { line, label, status: "invalid", targetId: null, changes: {}, values: {}, message: "duplicate" };
    }
    used.add(usedKey);

    const values: Record<string, number | string | null> = {};
    const changes: Record<string, PasteChange> = {};
    let invalid: string | null = null;

    for (const column of valueColumns) {
      const cell = (row[column.index] ?? "").trim();
      // An empty cell leaves the stored value alone. Clearing a result is a
      // deliberate act, not something a short row should do by accident.
      if (cell === "") continue;

      if (TEXT_FIELDS.has(column.key)) {
        values[column.key] = cell;
      } else {
        const parsed = parseNumber(cell);
        if (parsed === null) {
          invalid ??= `${column.key}: "${cell}"`;
          continue;
        }
        values[column.key] = parsed;
      }
    }

    if (finishedColumn) {
      const cell = (row[finishedColumn.index] ?? "").trim();
      if (cell !== "") {
        const read = readMeasurementFinished(cell, now);
        if (!read.ok) {
          // Named apart, because the two mean different things to whoever has
          // to fix the sheet: one cell is unreadable, the other reads fine and
          // says tomorrow.
          // A reason key for the future case, the way noMatch and duplicate
          // are: the dialog translates it, and the offending cell is already
          // visible in its own column. An unreadable cell keeps the raw form,
          // because there the text itself is the thing to look at.
          invalid ??= read.reason === "future" ? "futureDate" : `measurementFinished: "${cell}"`;
        } else {
          values.measurementFinished = read.value.toISOString();
        }
      }
    }

    if (invalid) {
      return { line, label, status: "invalid", targetId: sub ? null : target.id, changes: {}, values: {}, message: invalid };
    }

    if (sub) {
      // Nothing is there yet, so every filled-in cell is a change.
      for (const [field, value] of Object.entries(values)) changes[field] = { from: null, to: value };
      return { line, label, status: "create", targetId: null, sub, changes, values };
    }

    for (const [field, value] of Object.entries(values)) {
      const before = comparable(target.values[field as StoredKey]);
      if (before !== value) changes[field] = { from: before, to: value };
    }

    if (Object.keys(changes).length === 0) {
      return { line, label, status: "unchanged", targetId: target.id, changes: {}, values: {} };
    }

    const overwrites = findOverwrites(target.values, values);
    return {
      line,
      label,
      status: "update",
      targetId: target.id,
      changes,
      ...(overwrites.length > 0 ? { overwrites } : {}),
      values,
    };
  });

  return {
    rows: mapped,
    matchedBy,
    keyHeader: keyColumn?.header ?? null,
    hasHeader,
    columns: valueColumns.map((column) => column.key as PasteField),
    summary: {
      total: mapped.length,
      update: mapped.filter((row) => row.status === "update").length,
      create: mapped.filter((row) => row.status === "create").length,
      unchanged: mapped.filter((row) => row.status === "unchanged").length,
      unknown: mapped.filter((row) => row.status === "unknown").length,
      invalid: mapped.filter((row) => row.status === "invalid").length,
      overwrite: mapped.filter((row) => (row.overwrites?.length ?? 0) > 0).length,
    },
    blocker,
  };
}
