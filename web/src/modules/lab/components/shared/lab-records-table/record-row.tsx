"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { TableCell } from "@/core/components/ui/table";
import { AnimatedTableRow } from "@/core/components/ui/animated-table-row";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { cn } from "@/core/lib/utils";
import { IoChevronForward } from "react-icons/io5";
import { PIN_TICK, PIN_TINT, type Movable } from "@/modules/lab/components/shared/lab-records-table/columns";
import { SampleCell } from "@/modules/lab/components/shared/lab-records-table/sample-cell";
import { RecordCells } from "@/modules/lab/components/shared/lab-records-table/record-cells";

/** One row as drawn: its tick box, the sample that names it, its results. */
export function RecordRow({
  record,
  index,
  isAssay,
  canSelect,
  isSelected,
  open,
  anySubs,
  columns,
  pinSample,
  formatDate,
  onRowClick,
  onRowKey,
  onToggleBox,
  onNoteShift,
  onToggleSubs,
  onHistory,
}: {
  record: LabRecordListItemDTO;
  index: number;
  isAssay: boolean;
  canSelect: boolean;
  isSelected: boolean;
  open: boolean;
  anySubs: boolean;
  columns: Movable[];
  pinSample: string;
  formatDate: (shiftDate: string) => string;
  onRowClick: (event: MouseEvent<HTMLTableRowElement>, record: LabRecordListItemDTO, index: number) => void;
  onRowKey: (event: KeyboardEvent<HTMLTableRowElement>, record: LabRecordListItemDTO, index: number) => void;
  onToggleBox: (record: LabRecordListItemDTO, index: number) => void;
  onNoteShift: (shiftKey: boolean) => void;
  onToggleSubs: (record: LabRecordListItemDTO) => void;
  onHistory: (record: LabRecordListItemDTO) => void;
}) {
  const t = useTranslations("database");
  const isSub = Boolean(record.parentId);

  return (
    <AnimatedTableRow
      data-tour={index === 0 ? "records-row" : undefined}
      index={index}
      tabIndex={0}
      aria-label={
        isAssay ? undefined : t("sheet.openFor", { code: isSub ? record.labCode : record.sample.sampleCode })
      }
      data-selected={isSelected || undefined}
      onClick={(event) => onRowClick(event, record, index)}
      onKeyDown={(event) => onRowKey(event, record, index)}
      className={cn(
        "group cursor-pointer select-none focus-visible:bg-muted/60 focus-visible:outline-none",
        isAssay && isSelected && "bg-primary/5"
      )}
    >
      {canSelect ? (
        <TableCell className={cn(PIN_TICK, isAssay && PIN_TINT, "group-hover:bg-muted")}>
          <input
            type="checkbox"
            className="size-4 accent-primary"
            aria-label={isSub ? record.labCode : record.sample.sampleCode}
            data-tour={index === 0 ? "records-row-select" : undefined}
            checked={isSelected}
            onChange={() => onToggleBox(record, index)}
            // The change event does not say whether shift was held.
            onMouseDown={(event) => {
              onNoteShift(event.shiftKey);
            }}
          />
        </TableCell>
      ) : null}
      <SampleCell
        record={record}
        isAssay={isAssay}
        open={open}
        anySubs={anySubs}
        pinSample={pinSample}
        onToggleSubs={onToggleSubs}
        onHistory={onHistory}
      />
      {/* In the order the headings were arranged. A row with no
          results yet shows a dash per column rather than one
          merged cell: with the columns movable, the result
          columns need not sit side by side. */}
      <RecordCells columns={columns} record={record} formatDate={formatDate} />
      {isAssay ? null : (
        <TableCell className="text-muted-foreground">
          <IoChevronForward aria-hidden className="size-4" />
        </TableCell>
      )}
    </AnimatedTableRow>
  );
}
