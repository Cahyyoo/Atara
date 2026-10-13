"use client";

import { memo, type HTMLAttributes, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { cn } from "@/core/lib/utils";
import { inSelection } from "@/modules/lab/components/assay/grid/use-grid-selection";
import { StatusMark } from "@/modules/lab/components/assay/paste-sheet/sheet-status";
import { SHEET_ROW_HEIGHT } from "@/modules/lab/components/assay/paste-sheet/use-paste-sheet";
import type { SheetRow } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import type { Verdict } from "@/modules/lab/components/assay/paste-sheet/sheet-check";

export interface SheetColumn {
  key: string;
  label: string;
  /** Numbers right-aligned in a narrow box; the date is typed as the sheet writes it. */
  kind: "key" | "number" | "text" | "date";
  /** For a number: the most it may be (100, or 1000 for Sum). */
  max?: number;
}

/** What is wrong with a box before the server has said anything, and what a date was read as. */
export type CellCheck = (column: SheetColumn, value: string) => { problem: string | null; hint?: string };

const WIDTH: Record<SheetColumn["kind"], string> = {
  key: "w-72 min-w-72",
  number: "w-24 min-w-24",
  text: "w-40 min-w-40",
  date: "w-40 min-w-40",
};

interface RowProps {
  index: number;
  row: SheetRow;
  columns: readonly SheetColumn[];
  verdict: Verdict | undefined;
  pending: boolean;
  locked: boolean;
  selection: string | null;
  rowLabel: string;
  datePlaceholder: string;
  checkCell: CellCheck;
  onCellChange: (row: number, key: string, value: string) => void;
}

/**
 * One row, memoised: typing re-renders the row being typed in, not the
 * thousands beside it. A box is marked the moment it is wrong -- a number that
 * is not one, a date that cannot be read or lies in the future -- without
 * waiting for the server; then the server's verdict paints the rest: the cell
 * at fault red, a result that would replace another amber with the old value
 * as its tooltip, an unknown Sample ID red.
 */
const SheetRowView = memo(function SheetRowView({
  index,
  row,
  columns,
  verdict,
  pending,
  locked,
  selection,
  rowLabel,
  datePlaceholder,
  checkCell,
  onCellChange,
}: RowProps) {
  const filled = columns.some((column) => (row[column.key] ?? "").trim() !== "");
  const overwrites = new Map((verdict?.overwrites ?? []).map((entry) => [entry.field, entry]));

  return (
    <tr style={{ height: SHEET_ROW_HEIGHT }} className="border-b border-border/50">
      <td className="sticky left-0 z-10 w-16 min-w-16 bg-background px-2">
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          {index + 1}
          <StatusMark verdict={verdict} filled={filled} pending={pending} />
        </span>
      </td>
      {columns.map((column, col) => {
        const value = row[column.key] ?? "";
        const local = checkCell(column, value);
        const serverFault =
          (verdict?.status === "invalid" && verdict.field === column.key) ||
          (verdict?.status === "unknown" && column.key === "sampleIdent");
        const faulty = local.problem !== null || serverFault;
        const replaced = overwrites.get(column.key);
        const title =
          local.problem ??
          (serverFault
            ? verdict?.message
            : replaced
              ? `${String(replaced.from)} → ${replaced.to === null ? "—" : String(replaced.to)}`
              : local.hint);
        return (
          <td key={column.key} className={cn("p-0.5", WIDTH[column.kind], column.kind === "key" && "sticky left-16 z-10 bg-background")}>
            <Input
              aria-label={`${rowLabel} ${column.label}`}
              inputMode={column.kind === "number" ? "decimal" : undefined}
              placeholder={column.kind === "date" ? datePlaceholder : undefined}
              autoComplete="off"
              readOnly={locked}
              data-cell-row={index}
              data-cell-col={col}
              data-selected={inSelection(selection, col) ? "" : undefined}
              aria-invalid={faulty ? true : undefined}
              title={title}
              value={value}
              onChange={(event) => onCellChange(index, column.key, event.target.value)}
              className={cn(
                "h-8 rounded-md border-transparent bg-transparent px-2 text-sm shadow-none placeholder:text-muted-foreground/40 focus-visible:bg-background",
                column.kind === "number" && "text-right tabular-nums",
                column.kind === "date" && "tabular-nums",
                column.kind === "key" && "font-mono text-xs",
                replaced && !faulty && "bg-amber-100/70 dark:bg-amber-500/15",
                "data-[selected]:bg-primary/15 data-[selected]:ring-1 data-[selected]:ring-primary/50"
              )}
            />
          </td>
        );
      })}
      <td aria-hidden className="w-full" />
    </tr>
  );
});

/**
 * The sheet itself: headed as the instrument's export is headed, a header
 * that stays put, and only the rows in view rendered (useVirtualRows) between
 * two spacers, so five thousand rows scroll as lightly as thirty.
 */
export function SheetGrid({
  columns,
  rows,
  verdictFor,
  pending,
  locked,
  checkCell,
  selectionFor,
  scrollerRef,
  onScroll,
  start,
  end,
  padTop,
  padBottom,
  containerProps,
  onCellChange,
}: {
  columns: readonly SheetColumn[];
  rows: readonly SheetRow[];
  verdictFor: (row: SheetRow) => Verdict | undefined;
  pending: boolean;
  locked: boolean;
  checkCell: CellCheck;
  selectionFor: (row: number) => string | null;
  scrollerRef: Ref<HTMLDivElement>;
  onScroll: () => void;
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
  containerProps: HTMLAttributes<HTMLDivElement> & { ref: Ref<HTMLDivElement> };
  onCellChange: (row: number, key: string, value: string) => void;
}) {
  const t = useTranslations("assay.sheet");
  const span = columns.length + 2;

  return (
    <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto rounded-xl border bg-background">
      <div {...containerProps} className="w-max min-w-full data-[dragging]:select-none">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-muted">
            {/* Headed as the instrument's sheet is: bold, centred, wrapping to two lines. */}
            <tr className="h-12 border-b text-xs font-semibold text-foreground">
              <th className="sticky left-0 z-10 bg-muted px-2 text-left text-muted-foreground">{t("statusColumn")}</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "border-l border-border/60 px-2 text-center leading-tight whitespace-normal",
                    column.kind === "key" && "sticky left-16 z-10 bg-muted"
                  )}
                >
                  {column.label}
                </th>
              ))}
              <th aria-hidden className="w-full" />
            </tr>
          </thead>
          <tbody>
            {padTop > 0 ? (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={span} />
              </tr>
            ) : null}
            {rows.slice(start, end).map((row, offset) => {
              const index = start + offset;
              return (
                <SheetRowView
                  key={index}
                  index={index}
                  row={row}
                  columns={columns}
                  verdict={verdictFor(row)}
                  pending={pending}
                  locked={locked}
                  selection={selectionFor(index)}
                  rowLabel={t("row", { row: index + 1 })}
                  datePlaceholder={t("datePlaceholder")}
                  checkCell={checkCell}
                  onCellChange={onCellChange}
                />
              );
            })}
            {padBottom > 0 ? (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={span} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
