"use client";

import { useTranslations } from "next-intl";
import { TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { ColumnHead } from "@/core/components/table/column-head";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import {
  CHEVRON_WIDTH,
  PIN_TICK,
  TICK_WIDTH,
  type Movable,
} from "@/modules/lab/components/shared/lab-records-table/columns";
import type { useRecordsLayout } from "@/modules/lab/components/shared/lab-records-table/use-records-layout";

/** The column widths, and the headings: tick-all, Sample, then the movable ones. */
export function RecordsTableHead({
  canSelect,
  isAssay,
  shownColumns,
  widthOf,
  sort,
  order,
  onSort,
  dragProps,
  dragKey,
  dropKey,
  pinSample,
  allShownSelected,
  noRecords,
  onToggleShown,
}: {
  canSelect: boolean;
  isAssay: boolean;
  shownColumns: Movable[];
  widthOf: (key: string) => number;
  sort: string;
  order: string;
  onSort: (field: string) => void;
  dragProps: ReturnType<typeof useRecordsLayout>["dragProps"];
  dragKey: string | null;
  dropKey: string | null;
  pinSample: string;
  allShownSelected: boolean;
  noRecords: boolean;
  onToggleShown: () => void;
}) {
  const t = useTranslations("database");
  const tCommon = useTranslations("common");

  /** What each movable column is called, how it sorts, and how it lines up. */
  function headFor(key: Movable): { label: string; sortField?: string; align: "left" | "right" } {
    if (key === "shiftDate") return { label: t("shiftDate"), sortField: "shiftDate", align: "left" };
    if (key === "status") return { label: tCommon("status"), align: "left" };
    const assay = ASSAY_FIELDS.find((field) => field.key === key);
    if (assay) {
      // The unit on the header rather than on every value.
      return { label: assay.key === "sum" ? assay.shortLabel : `${assay.shortLabel} %`, sortField: assay.key, align: "right" };
    }
    return { label: t(key), sortField: key, align: "left" };
  }

  /** The props every resizable, reorderable heading shares. */
  const headProps = {
    sort,
    order,
    onSort,
    ...dragProps,
  };

  return (
    <>
      <colgroup>
        {canSelect ? <col style={{ width: TICK_WIDTH }} /> : null}
        <col style={{ width: widthOf("sample") }} />
        {shownColumns.map((key) => (
          <col key={key} data-col={key} style={{ width: widthOf(key) }} />
        ))}
        {isAssay ? null : <col style={{ width: CHEVRON_WIDTH }} />}
      </colgroup>
      <TableHeader>
        <TableRow>
          {canSelect ? (
            <TableHead className={PIN_TICK}>
              <input
                type="checkbox"
                className="size-4 accent-primary"
                aria-label={t("selectShown")}
                checked={allShownSelected}
                disabled={noRecords}
                onChange={onToggleShown}
              />
            </TableHead>
          ) : null}
          <ColumnHead
            {...headProps}
            columnKey="sample"
            label={t("sampleColumn")}
            sortField="labCode"
            width={widthOf("sample")}
            className={pinSample}
            resizeLabel={t("layout.resize", { column: t("sampleColumn") })}
            moveHint=""
          />
          {shownColumns.map((key) => {
            const head = headFor(key);
            return (
              <ColumnHead
                key={key}
                {...headProps}
                columnKey={key}
                label={head.label}
                sortField={head.sortField}
                align={head.align}
                width={widthOf(key)}
                movable
                dragging={dragKey === key}
                dropTarget={dropKey === key}
                resizeLabel={t("layout.resize", { column: head.label })}
                moveHint={t("layout.move")}
              />
            );
          })}
          {isAssay ? null : (
            <TableHead>
              <span className="sr-only">{t("sheet.open")}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
    </>
  );
}
