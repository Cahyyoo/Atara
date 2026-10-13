"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/core/components/ui/label";
import { AssayInput, InstrumentInput, RemarksInput } from "@/modules/lab/components/assay/result-cells";
import {
  cellId,
  handleKeyDown,
  isRowDirty,
  numberProblem,
  type CellField,
  type CellProblem,
  type InstrumentColumn,
  type RowValues,
} from "@/modules/lab/components/assay/results-grid";
import type { AssayFieldSpec } from "@/modules/lab/lib/records/assay";
import { cn } from "@/core/lib/utils";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { IoCheckmarkCircle } from "react-icons/io5";

/**
 * The same boxes as the grid, wrapped instead of laid out in a line.
 *
 * Eighteen columns in a row is right when there are twenty samples: a column
 * can be read straight down and compared, and that is worth scrolling
 * sideways for. It is wrong for one sample, which is how this screen is most
 * often reached -- a single row of eighteen boxes stretched across two
 * screens' width while the rest of the page sat empty, so filling in one
 * result meant scrolling back and forth past everything already typed.
 *
 * Wrapped, the same eighteen fit on one screen with room to spare, and the
 * vertical space that was doing nothing is what pays for it.
 *
 * The cell ids are the grid's, unchanged and deliberately: Enter still steps
 * to the same field in the next sample, so somebody filling in Ni for three
 * samples types a number, Enter, a number, Enter -- exactly as before.
 */
export function ResultsForm({
  records,
  values,
  original,
  savedIds,
  columns,
  instrumentColumns,
  showRemarks,
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
  formatDate: (shiftDate: string) => string;
  onCellChange: (id: string, field: CellField, value: string) => void;
}) {
  const t = useTranslations("assay");
  const tDatabase = useTranslations("database");

  const problemLabels = useMemo<Record<CellProblem, (max: number) => string>>(
    () => ({
      notNumber: () => t("cell.notNumber"),
      outOfRange: (max) => t("cell.outOfRange", { max }),
      tooManyDecimals: () => t("cell.tooManyDecimals"),
    }),
    [t]
  );

  return (
    <div className="flex flex-col gap-4">
      {records.map((record, rowIndex) => {
        const row = values[record.id];
        const before = original[record.id];
        if (!row || !before) return null;

        const dirty = isRowDirty(before, row);
        const saved = savedIds.has(record.id);
        const name = record.sample.sampleCode;
        const changed = (field: CellField) => before[field] !== row[field];
        const revert = (field: CellField) => () => onCellChange(record.id, field, before[field]);

        return (
          <section
            key={record.id}
            aria-label={name}
            className={cn(
              "rounded-lg border bg-background p-4",
              dirty && "border-amber-300 dark:border-amber-500/40"
            )}
          >
            <header className="mb-3 flex items-center gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-sm font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {record.sampleIdent ?? record.labCode} · {formatDate(record.shiftDate)}
                </span>
              </div>
              {/* The same two marks the grid uses, so a row means the same
                  thing in either layout. */}
              {dirty ? (
                <span aria-hidden className="ml-auto size-2 shrink-0 rounded-full bg-amber-500" />
              ) : saved ? (
                <IoCheckmarkCircle aria-hidden className="ml-auto size-4 shrink-0 text-emerald-600" />
              ) : null}
            </header>

            {/*
              Six across on a wide screen, fewer as it narrows.

              Eighteen assay columns land as three tidy rows of six, which is
              the whole point: nothing is off-screen, so nothing has to be
              scrolled back to.
            */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
              {columns.map((field) => {
                const problem = numberProblem(row[field.key], field.max);
                return (
                  <div key={field.key} className="flex flex-col gap-1">
                    <Label htmlFor={cellId(rowIndex, field.key)} className="text-xs font-normal text-muted-foreground">
                      {field.key === "sum" ? field.shortLabel : `${field.shortLabel} %`}
                    </Label>
                    <AssayInput
                      id={cellId(rowIndex, field.key)}
                      ariaLabel={`${name} ${field.shortLabel}`}
                      value={row[field.key]}
                      changed={changed(field.key)}
                      problem={problem}
                      problemLabel={problem ? problemLabels[problem](field.max) : undefined}
                      onChange={(value) => onCellChange(record.id, field.key, value)}
                      onKeyDown={(event) => handleKeyDown(event, rowIndex, field.key, revert(field.key))}
                    />
                  </div>
                );
              })}
            </div>

            {instrumentColumns.length > 0 || showRemarks ? (
              /* Wider boxes than the numbers, so they get their own row rather
                 than stretching the six-column rhythm above. */
              <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {instrumentColumns.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1">
                    <Label htmlFor={cellId(rowIndex, field.key)} className="text-xs font-normal text-muted-foreground">
                      {field.label}
                    </Label>
                    <InstrumentInput
                      id={cellId(rowIndex, field.key)}
                      ariaLabel={`${name} ${field.label}`}
                      kind={field.kind}
                      value={row[field.key]}
                      changed={changed(field.key)}
                      onChange={(value) => onCellChange(record.id, field.key, value)}
                      onKeyDown={(event) => handleKeyDown(event, rowIndex, field.key, revert(field.key))}
                    />
                  </div>
                ))}
                {showRemarks ? (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={cellId(rowIndex, "remarks")} className="text-xs font-normal text-muted-foreground">
                      {tDatabase("dialog.remarks")}
                    </Label>
                    <RemarksInput
                      id={cellId(rowIndex, "remarks")}
                      ariaLabel={`${name} remarks`}
                      value={row.remarks}
                      changed={changed("remarks")}
                      onChange={(value) => onCellChange(record.id, "remarks", value)}
                      onKeyDown={(event) => handleKeyDown(event, rowIndex, "remarks", revert("remarks"))}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
