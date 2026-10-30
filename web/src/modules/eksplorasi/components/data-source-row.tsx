"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/core/components/ui/badge";
import { cn } from "@/core/lib/utils";
import { alignOf, isNumericColumn, type ListColumn } from "@/modules/eksplorasi/components/list-columns";
import type { DataSourceDTO, SampleType } from "@/modules/eksplorasi/types";
import { IoPencilOutline, IoTrashOutline } from "react-icons/io5";

/** One colour per type, so the data source reads at a glance. */
export const TYPE_VARIANT: Record<SampleType, "default" | "secondary" | "outline" | "destructive"> = {
  FIELD: "outline",
  STANDARD: "default",
  BLANK: "secondary",
  DUPLICATE: "secondary",
};

/** Cell padding at each density: roomy with the default columns, tight with every element on. */
export const CELL_PAD = { comfortable: "px-3 py-2.5", compact: "px-1 py-1.5" } as const;
export const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;

/**
 * One row of a list. Every cell keeps to its column and its column's
 * alignment: a number stays on one line, text is cut at the end of its line
 * (two lines when the table is compact). Pointing at a cell shows the whole
 * value. Clicking the row, or Enter on it, opens its detail panel; the edit
 * and delete buttons do only their own job.
 */
export function DataSourceRow({
  row,
  number,
  columns,
  compact,
  onOpen,
  onEdit,
  onDelete,
}: {
  row: DataSourceDTO;
  /** Its place in the whole list, counting on from the pages before. */
  number: number;
  columns: readonly ListColumn[];
  compact: boolean;
  onOpen: (row: DataSourceDTO) => void;
  onEdit: (row: DataSourceDTO) => void;
  onDelete: (row: DataSourceDTO) => void;
}) {
  const t = useTranslations("dataSource");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const empty = tCommon("empty");
  const pad = compact ? CELL_PAD.compact : CELL_PAD.comfortable;

  function text(column: ListColumn): string | null {
    if (column === "rowNo") return String(number);
    if (column === "fromTo") return row.from || row.to ? `${row.from ?? empty}–${row.to ?? empty}` : null;
    if (column === "date") return row.date ? format.dateTime(new Date(`${row.date}T00:00:00`), { dateStyle: "short" }) : null;
    // Picked from a calendar now, so written as Date is; a value from before then shows as it was written.
    if (column === "controlDate" && row.controlDate && /^\d{4}-\d{2}-\d{2}$/.test(row.controlDate)) {
      return format.dateTime(new Date(`${row.controlDate}T00:00:00`), { dateStyle: "short" });
    }
    if (column === "actions" || column === "sampleType") return null;
    return row[column];
  }

  function onKey(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onOpen(row);
  }

  /** A button in the row does its own job, without also opening the panel. */
  const only = (action: (row: DataSourceDTO) => void) => (event: MouseEvent) => {
    event.stopPropagation();
    action(row);
  };

  return (
    <tr
      tabIndex={0}
      aria-label={t("detail.open", { sampleId: row.sampleId })}
      onClick={() => onOpen(row)}
      onKeyDown={onKey}
      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
    >
      {columns.map((column) => {
        if (column === "actions") {
          return (
            <td key={column} className={cn(compact ? "px-0.5 py-0.5" : "px-2 py-1.5", "align-middle")}>
              <div className={cn("flex items-center justify-center", compact ? "flex-col gap-0.5" : "gap-1")}>
                <button
                  type="button"
                  aria-label={t("editRow", { sampleId: row.sampleId })}
                  title={tCommon("edit")}
                  onClick={only(onEdit)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <IoPencilOutline className={compact ? "size-3.5" : "size-4"} />
                </button>
                <button
                  type="button"
                  aria-label={t("delete.label", { sampleId: row.sampleId })}
                  title={t("delete.action")}
                  onClick={only(onDelete)}
                  className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                >
                  <IoTrashOutline className={compact ? "size-3.5" : "size-4"} />
                </button>
              </div>
            </td>
          );
        }
        if (column === "sampleType") {
          const label = t(`sampleType.${row.sampleType}`);
          return (
            <td key={column} className={cn(pad, "text-center align-middle")} title={label}>
              <Badge
                variant={TYPE_VARIANT[row.sampleType]}
                className={cn("max-w-full truncate", compact ? "px-1 text-[10px]" : "text-[11px]")}
              >
                {t(`sampleTypeShort.${row.sampleType}`)}
              </Badge>
            </td>
          );
        }
        const value = text(column);
        const numeric = isNumericColumn(column);
        return (
          <td
            key={column}
            title={value ?? undefined}
            className={cn(
              pad,
              "align-middle",
              ALIGN_CLASS[alignOf(column)],
              numeric && "truncate tabular-nums",
              numeric && compact && "px-0.5 tracking-tight",
              (column === "date" || column === "controlDate") && "whitespace-nowrap",
              column === "sampleId" && "font-medium",
              (column === "rowNo" || value === null) && "text-muted-foreground",
              value === null && "text-muted-foreground/60"
            )}
          >
            {numeric ? (
              (value ?? empty)
            ) : (
              <span className={cn("block", compact ? "line-clamp-2 break-all" : "truncate")}>{value ?? empty}</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
