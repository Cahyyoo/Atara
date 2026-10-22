"use client";

import { useTranslations } from "next-intl";
import { ColumnHead } from "@/core/components/table/column-head";
import { cn } from "@/core/lib/utils";
import { ALIGN_CLASS, CELL_PAD } from "@/modules/eksplorasi/components/data-source-row";
import { alignOf, columnWeight, type ListColumn } from "@/modules/eksplorasi/components/list-columns";
import type { useListLayout } from "@/modules/eksplorasi/components/use-list-layout";
import { ELEMENT_LABELS, isElementField } from "@/modules/eksplorasi/lib/data-source-columns";

/** A heading at each density: the same padding as the cells below it, so both line up. */
const HEAD = {
  comfortable: cn(CELL_PAD.comfortable, "h-auto text-xs font-semibold leading-tight text-foreground"),
  compact: cn(CELL_PAD.compact, "h-auto py-2 text-[11px] font-semibold leading-tight text-foreground"),
} as const;

/** A list's column heading as people read it. */
export function useColumnLabel() {
  const t = useTranslations("dataSource");
  const tCommon = useTranslations("common");
  return (column: ListColumn): string => {
    if (column === "actions") return tCommon("actions");
    if (isElementField(column)) return ELEMENT_LABELS[column];
    return t(`fields.${column}`);
  };
}

/**
 * The list's headings and the widths of its columns. Every heading but the
 * number and the buttons can be dragged onto another to move its column
 * there; nothing is resized, so the columns keep sharing the page's width.
 * Each heading sits where its column's values sit: left, centre or right.
 */
export function DataSourceTableHead({ layout, compact }: { layout: ReturnType<typeof useListLayout>; compact: boolean }) {
  const t = useTranslations("dataSource");
  const label = useColumnLabel();
  const head = compact ? HEAD.compact : HEAD.comfortable;

  return (
    <>
      <colgroup>
        {layout.columns.map((column, index) => (
          <col key={column} data-col={column} style={{ width: layout.widths[index] }} />
        ))}
      </colgroup>
      <thead className="bg-muted/60">
        <tr className="border-b">
          {layout.columns.map((column) =>
            column === "rowNo" || column === "actions" ? (
              <th key={column} scope="col" className={cn(head, "align-middle", ALIGN_CLASS[alignOf(column)])}>
                {label(column)}
              </th>
            ) : (
              <ColumnHead
                key={column}
                columnKey={column}
                label={label(column)}
                width={columnWeight(column)}
                align={alignOf(column)}
                className={head}
                movable
                resizable={false}
                compact
                dragging={layout.dragKey === column}
                dropTarget={layout.dropKey === column}
                moveHint={t("layout.move")}
                {...layout.dragProps}
              />
            )
          )}
        </tr>
      </thead>
    </>
  );
}
