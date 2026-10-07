"use client";

import { memo, useMemo, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { AssayInput, InstrumentInput, RemarksInput } from "@/components/assay/result-cells";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ASSAY_FIELDS, INSTRUMENT_FIELDS, type AssayField, type AssayFieldSpec, type InstrumentField } from "@/lib/assay";
import { toWitaInputValue } from "@/lib/shift-date";
import { cn } from "@/lib/utils";
import type { LabRecordListItemDTO } from "@/types";
import { IoCheckmarkCircle } from "react-icons/io5";

export type CellField = AssayField | InstrumentField | "remarks";
export type RowValues = Record<CellField, string>;

/** A column of the grid that is not an assay number. */
export type InstrumentColumn = (typeof INSTRUMENT_FIELDS)[number] & { label: string };

export function toRowValues(record: LabRecordListItemDTO): RowValues {
  const values = {} as RowValues;
  for (const field of ASSAY_FIELDS) {
    const value = record[field.key];
    values[field.key] = value === null ? "" : String(value);
  }
  for (const field of INSTRUMENT_FIELDS) {
    const value = record[field.key];
    // The box holds a WITA wall clock, never the stored instant: a
    // datetime-local input has no timezone and would read an ISO string in
    // the browser's own zone, or refuse it outright.
    values[field.key] =
      value == null ? "" : field.kind === "datetime" ? toWitaInputValue(value) : String(value);
  }
  values.remarks = record.remarks ?? "";
  return values;
}

const ALL_CELL_FIELDS: CellField[] = [
  ...ASSAY_FIELDS.map((field) => field.key),
  ...INSTRUMENT_FIELDS.map((field) => field.key),
  "remarks",
];

export function isRowDirty(original: RowValues, current: RowValues): boolean {
  return ALL_CELL_FIELDS.some((field) => original[field] !== current[field]);
}

/**
 * A typed number, as the server wants it.
 *
 * Commas are accepted as the decimal mark: it is what an Indonesian keyboard
 * and an Indonesian spreadsheet produce, and the old number box turned
 * "1,86" into an empty value that then saved as no result at all.
 */
export function normaliseNumber(raw: string): string {
  return raw.trim().replace(",", ".");
}

export type CellProblem = "notNumber" | "outOfRange" | "tooManyDecimals";

/** What is wrong with a typed value, or null. Empty is fine: it means "no result". */
export function numberProblem(raw: string, max: number): CellProblem | null {
  const value = normaliseNumber(raw);
  if (value === "") return null;
  if (!/^\d+(\.\d+)?$/.test(value)) return "notNumber";
  // The column holds three decimals; a fourth would be rounded away silently.
  if ((value.split(".")[1]?.length ?? 0) > 3) return "tooManyDecimals";
  if (Number(value) > max) return "outOfRange";
  return null;
}

/** Every invalid cell in a row, in column order. */
export function rowProblems(row: RowValues): { field: AssayField; problem: CellProblem }[] {
  return ASSAY_FIELDS.flatMap((field) => {
    const problem = numberProblem(row[field.key], field.max);
    return problem ? [{ field: field.key, problem }] : [];
  });
}

export function cellId(rowIndex: number, field: CellField): string {
  return `cell-${rowIndex}-${field}`;
}

function focusCell(rowIndex: number, field: CellField) {
  const next = document.getElementById(cellId(rowIndex, field));
  if (next instanceof HTMLInputElement) {
    next.focus();
    next.select();
  }
}

/**
 * Moving the way a spreadsheet does: down the same column with Enter or the
 * arrow, back up with Shift+Enter or the arrow. Esc puts back what was there.
 *
 * Arrows are taken over on purpose: in the old number boxes they nudged the
 * value by 0.001, which is a changed result nobody meant to type.
 */
export function handleKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  rowIndex: number,
  field: CellField,
  onRevert: () => void
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onRevert();
    return;
  }
  const down = (event.key === "Enter" && !event.shiftKey) || event.key === "ArrowDown";
  const up = (event.key === "Enter" && event.shiftKey) || event.key === "ArrowUp";
  if (!down && !up) return;
  // A datetime box uses the arrows for its own fields.
  if (event.currentTarget.type === "datetime-local" && event.key !== "Enter") return;
  event.preventDefault();
  focusCell(rowIndex + (down ? 1 : -1), field);
}

interface RowProps {
  record: LabRecordListItemDTO;
  rowIndex: number;
  row: RowValues;
  original: RowValues;
  saved: boolean;
  columns: AssayFieldSpec[];
  instrumentColumns: InstrumentColumn[];
  showRemarks: boolean;
  dateLabel: string;
  problemLabels: Record<CellProblem, (max: number) => string>;
  onCellChange: (id: string, field: CellField, value: string) => void;
}

/**
 * One row, memoised: a keystroke re-renders the row being typed in and not
 * the other twenty-four, because only its own `row` object changes identity.
 */
const ResultRow = memo(function ResultRow({
  record,
  rowIndex,
  row,
  original,
  saved,
  columns,
  instrumentColumns,
  showRemarks,
  dateLabel,
  problemLabels,
  onCellChange,
}: RowProps) {
  const dirty = isRowDirty(original, row);
  const name = record.sample.sampleCode;

  const changed = (field: CellField) => original[field] !== row[field];
  const revert = (field: CellField) => () => onCellChange(record.id, field, original[field]);

  return (
    <TableRow className={cn(dirty && "bg-amber-50/60 dark:bg-amber-500/5")}>
      {/* Pinned, so the row is still named after scrolling across to Zn. */}
      <TableCell className="left-0 z-10 w-40 min-w-40 bg-background py-1.5 sm:sticky sm:w-64 sm:min-w-56">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-mono text-xs font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {(record.sampleIdent ?? record.labCode) + " · " + dateLabel}
            </span>
          </div>
          {dirty ? (
            <span aria-hidden className="ml-auto size-2 shrink-0 rounded-full bg-amber-500" />
          ) : saved ? (
            <IoCheckmarkCircle aria-hidden className="ml-auto size-4 shrink-0 text-emerald-600" />
          ) : null}
        </div>
      </TableCell>
      {columns.map((field) => {
        const problem = numberProblem(row[field.key], field.max);
        return (
          <TableCell key={field.key} className="p-1">
            <AssayInput
              id={cellId(rowIndex, field.key)}
              ariaLabel={`${name} ${field.shortLabel}`}
              value={row[field.key]}
              changed={changed(field.key)}
              problem={problem}
              problemLabel={problem ? problemLabels[problem](field.max) : undefined}
              className="w-24"
              onChange={(value) => onCellChange(record.id, field.key, value)}
              onKeyDown={(event) => handleKeyDown(event, rowIndex, field.key, revert(field.key))}
            />
          </TableCell>
        );
      })}
      {instrumentColumns.map((field) => (
        <TableCell key={field.key} className="p-1">
          <InstrumentInput
            id={cellId(rowIndex, field.key)}
            ariaLabel={`${name} ${field.label}`}
            kind={field.kind}
            value={row[field.key]}
            changed={changed(field.key)}
            className="min-w-40"
            onChange={(value) => onCellChange(record.id, field.key, value)}
            onKeyDown={(event) => handleKeyDown(event, rowIndex, field.key, revert(field.key))}
          />
        </TableCell>
      ))}
      {showRemarks ? (
        <TableCell className="p-1">
          <RemarksInput
            id={cellId(rowIndex, "remarks")}
            ariaLabel={`${name} remarks`}
            value={row.remarks}
            changed={changed("remarks")}
            className="min-w-48"
            onChange={(value) => onCellChange(record.id, "remarks", value)}
            onKeyDown={(event) => handleKeyDown(event, rowIndex, "remarks", revert("remarks"))}
          />
        </TableCell>
      ) : null}
      {/* Takes up the spare width, so the boxes sit next to the name they
          belong to instead of across the screen from it. */}
      <TableCell aria-hidden className="w-full p-0" />
    </TableRow>
  );
});

export function ResultsGrid({
  records,
  values,
  original,
  savedIds,
  columns,
  instrumentColumns,
  showRemarks,
  isLoading,
  emptyMessage,
  formatDate,
  onCellChange,
}: {
  records: LabRecordListItemDTO[];
  values: Record<string, RowValues>;
  original: Record<string, RowValues>;
  savedIds: Set<string>;
  columns: AssayFieldSpec[];
  instrumentColumns: InstrumentColumn[];
  showRemarks: boolean;
  isLoading: boolean;
  emptyMessage: string;
  formatDate: (shiftDate: string) => string;
  onCellChange: (id: string, field: CellField, value: string) => void;
}) {
  const t = useTranslations("assay");
  const tDatabase = useTranslations("database");
  // The sample, the chosen columns, and the spare-width filler at the end.
  const columnCount = 2 + columns.length + instrumentColumns.length + (showRemarks ? 1 : 0);

  // Resolved once here so the memoised rows need no translations of their own.
  // Stable between renders, or every row's memo would be defeated on each keystroke.
  const problemLabels = useMemo<Record<CellProblem, (max: number) => string>>(
    () => ({
      notNumber: () => t("cell.notNumber"),
      outOfRange: (max) => t("cell.outOfRange", { max }),
      tooManyDecimals: () => t("cell.tooManyDecimals"),
    }),
    [t]
  );

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Pinned from a tablet up. On a phone a pinned name would take most
                of the width and leave one box beside it. */}
            <TableHead className="left-0 z-10 w-40 min-w-40 bg-background sm:sticky sm:w-64 sm:min-w-56">{t("sampleColumn")}</TableHead>
            {columns.map((field) => (
              <TableHead key={field.key} className="w-24 text-right">
                {field.key === "sum" ? field.shortLabel : `${field.shortLabel} %`}
              </TableHead>
            ))}
            {instrumentColumns.map((field) => (
              <TableHead key={field.key}>{field.label}</TableHead>
            ))}
            {showRemarks ? <TableHead>{tDatabase("dialog.remarks")}</TableHead> : null}
            <TableHead aria-hidden className="w-full p-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && records.length === 0 ? (
            <TableSkeleton rows={8} columns={columnCount} />
          ) : records.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-32 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            records.map((record, rowIndex) => {
              const row = values[record.id];
              const before = original[record.id];
              if (!row || !before) return null;
              return (
                <ResultRow
                  key={record.id}
                  record={record}
                  rowIndex={rowIndex}
                  row={row}
                  original={before}
                  saved={savedIds.has(record.id)}
                  columns={columns}
                  instrumentColumns={instrumentColumns}
                  showRemarks={showRemarks}
                  dateLabel={formatDate(record.shiftDate)}
                  problemLabels={problemLabels}
                  onCellChange={onCellChange}
                />
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
