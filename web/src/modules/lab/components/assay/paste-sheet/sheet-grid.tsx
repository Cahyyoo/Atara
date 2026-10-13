"use client";

import { memo, type HTMLAttributes, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/core/components/ui/input";
import { cn } from "@/core/lib/utils";
import { inSelection } from "@/modules/lab/components/assay/grid/use-grid-selection";
import { StatusMark } from "@/modules/lab/components/assay/paste-sheet/sheet-status";
import { SHEET_ROW_HEIGHT } from "@/modules/lab/components/assay/paste-sheet/use-paste-sheet";
import type { SheetRow } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import type { ImportPreviewRow } from "@/modules/lab/types";

export interface SheetColumn {
  key: string;
  label: string;
  /** Numbers right-aligned in a narrow box; text and dates get room. */
  kind: "key" | "number" | "text" | "datetime";
}

const WIDTH: Record<SheetColumn["kind"], string> = {
  key: "w-72 min-w-72",
  number: "w-24 min-w-24",
  text: "w-44 min-w-44",
  datetime: "w-48 min-w-48",
};

interface RowProps {
  index: number;
  row: SheetRow;
  columns: readonly SheetColumn[];
  verdict: ImportPreviewRow | undefined;
  pending: boolean;
  selection: string | null;
  rowLabel: string;
  onCellChange: (row: number, key: string, value: string) => void;
}

/**
 * One row, memoised: typing re-renders the row being typed in, not the
 * thousands beside it. The verdict paints the cells -- the one at fault red,
 * a result that would replace another amber with the old value as its tooltip,
 * an unknown Sample ID red -- so the grid is its own preview.
 */
const SheetRowView = memo(function SheetRowView({
  index,
  row,
  columns,
  verdict,
  pending,
  selection,
  rowLabel,
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
        const faulty =
          (verdict?.status === "invalid" && verdict.field === column.key) ||
          (verdict?.status === "unknown" && column.key === "sampleIdent");
        const replaced = overwrites.get(column.key);
        const title = faulty
          ? verdict?.message
          : replaced
            ? `${String(replaced.from)} → ${replaced.to === null ? "—" : String(replaced.to)}`
            : undefined;
        return (
          <td key={column.key} className={cn("p-0.5", WIDTH[column.kind], column.kind === "key" && "sticky left-16 z-10 bg-background")}>
            <Input
              aria-label={`${rowLabel} ${column.label}`}
              type={column.kind === "datetime" ? "datetime-local" : "text"}
              inputMode={column.kind === "number" ? "decimal" : undefined}
              autoComplete="off"
              data-cell-row={index}
              data-cell-col={col}
              data-selected={inSelection(selection, col) ? "" : undefined}
              aria-invalid={faulty ? true : undefined}
              title={title}
              value={row[column.key] ?? ""}
              onChange={(event) => onCellChange(index, column.key, event.target.value)}
              className={cn(
                "h-8 rounded-md border-transparent bg-transparent px-2 text-sm shadow-none focus-visible:bg-background",
                column.kind === "number" && "text-right tabular-nums",
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
 * The sheet itself: a header that stays put, and only the rows in view
 * rendered (useVirtualRows) between two spacers, so five thousand rows scroll
 * as lightly as thirty.
 */
export function SheetGrid({
  columns,
  rows,
  verdicts,
  pending,
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
  verdicts: Map<number, ImportPreviewRow>;
  pending: boolean;
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
          <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur-xs">
            <tr className="h-10 border-b text-left text-xs font-medium text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted/95 px-2">{t("statusColumn")}</th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-2.5",
                    column.kind === "number" && "text-right",
                    column.kind === "key" && "sticky left-16 z-10 bg-muted/95"
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
                  verdict={verdicts.get(index)}
                  pending={pending}
                  selection={selectionFor(index)}
                  rowLabel={t("row", { row: index + 1 })}
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
