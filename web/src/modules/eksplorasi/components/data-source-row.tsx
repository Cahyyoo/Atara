"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/core/components/ui/badge";
import { cn } from "@/core/lib/utils";
import { isNumericColumn, type ListColumn } from "@/modules/eksplorasi/components/list-columns";
import type { DataSourceDTO, SampleType } from "@/modules/eksplorasi/types";
import { IoPencilOutline, IoTrashOutline } from "react-icons/io5";

/** One colour per type, so the data source reads at a glance. */
export const TYPE_VARIANT: Record<SampleType, "default" | "secondary" | "outline" | "destructive"> = {
  ORIGINAL: "outline",
  STANDARD: "default",
  BLANK: "secondary",
  DUPLICATE: "secondary",
};

const CELL = "px-1 py-1.5 align-middle";

/**
 * One row of a list. Every cell keeps to its column: a number stays on one
 * line (its column is sized for it), text wraps onto a second line and is
 * cut after that. Pointing at a cell shows the whole value.
 */
export function DataSourceRow({
  row,
  columns,
  onEdit,
  onDelete,
}: {
  row: DataSourceDTO;
  columns: readonly ListColumn[];
  onEdit: (row: DataSourceDTO) => void;
  onDelete: (row: DataSourceDTO) => void;
}) {
  const t = useTranslations("dataSource");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const empty = tCommon("empty");

  function text(column: ListColumn): string | null {
    if (column === "fromTo") return row.from || row.to ? `${row.from ?? empty}–${row.to ?? empty}` : null;
    if (column === "date") return row.date ? format.dateTime(new Date(`${row.date}T00:00:00`), { dateStyle: "short" }) : null;
    if (column === "actions" || column === "sampleType") return null;
    return row[column];
  }

  return (
    <tr className="border-b border-border/60 transition-colors hover:bg-muted/40">
      {columns.map((column) => {
        if (column === "actions") {
          return (
            <td key={column} className="px-0.5 py-0.5 text-right">
              <div className="flex flex-col items-end gap-0.5">
                <button
                  type="button"
                  aria-label={t("editRow", { sampleId: row.sampleId })}
                  title={tCommon("edit")}
                  onClick={() => onEdit(row)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <IoPencilOutline className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={t("delete.label", { sampleId: row.sampleId })}
                  title={t("delete.action")}
                  onClick={() => onDelete(row)}
                  className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                >
                  <IoTrashOutline className="size-3.5" />
                </button>
              </div>
            </td>
          );
        }
        if (column === "sampleType") {
          const label = t(`sampleType.${row.sampleType}`);
          return (
            <td key={column} className={CELL} title={label}>
              <Badge variant={TYPE_VARIANT[row.sampleType]} className="max-w-full truncate px-1 text-[10px]">
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
              CELL,
              numeric && "truncate px-0.5 text-right tabular-nums tracking-tight",
              column === "date" && "whitespace-nowrap",
              column === "sampleId" && "font-medium",
              value === null && "text-muted-foreground/60"
            )}
          >
            {numeric ? (value ?? empty) : <span className="line-clamp-2 break-all">{value ?? empty}</span>}
          </td>
        );
      })}
    </tr>
  );
}
