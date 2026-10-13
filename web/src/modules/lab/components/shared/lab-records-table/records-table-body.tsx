"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { TableBody, TableCell, TableRow } from "@/core/components/ui/table";
import { TableSkeleton } from "@/core/components/ui/table-skeleton";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { isInteractive, type Movable } from "@/modules/lab/components/shared/lab-records-table/columns";
import { RecordRow } from "@/modules/lab/components/shared/lab-records-table/record-row";

/** The rows: placeholders while the first page loads, a word when none match, or the rows. */
export function RecordsTableBody({
  isAssay,
  canSelect,
  isLoading,
  hasRecords,
  rows,
  columnCount,
  isFiltered,
  shownColumns,
  pinSample,
  formatDate,
  isSelected,
  isOpen,
  anySubs,
  onResetFilters,
  onPick,
  onOpen,
  onToggleBox,
  onNoteShift,
  onToggleSubs,
  onHistory,
}: {
  isAssay: boolean;
  canSelect: boolean;
  isLoading: boolean;
  hasRecords: boolean;
  rows: LabRecordListItemDTO[];
  columnCount: number;
  isFiltered: boolean;
  shownColumns: Movable[];
  pinSample: string;
  formatDate: (shiftDate: string) => string;
  isSelected: (record: LabRecordListItemDTO) => boolean;
  isOpen: (record: LabRecordListItemDTO) => boolean;
  anySubs: boolean;
  onResetFilters: () => void;
  /** Tick a row, carrying its new state across a range when shift was held. */
  onPick: (record: LabRecordListItemDTO, index: number, withShift: boolean) => void;
  /** Open a row's detail panel. */
  onOpen: (record: LabRecordListItemDTO) => void;
  onToggleBox: (record: LabRecordListItemDTO, index: number) => void;
  onNoteShift: (shiftKey: boolean) => void;
  onToggleSubs: (record: LabRecordListItemDTO) => void;
  onHistory: (record: LabRecordListItemDTO) => void;
}) {
  const t = useTranslations("database");

  function handleRowClick(
    event: MouseEvent<HTMLTableRowElement>,
    record: LabRecordListItemDTO,
    index: number
  ) {
    if (isInteractive(event.target)) return;
    // Picking is what the entry list is for, so the whole row is the tick box.
    if (isAssay) onPick(record, index, event.shiftKey);
    else onOpen(record);
  }

  function handleRowKey(
    event: KeyboardEvent<HTMLTableRowElement>,
    record: LabRecordListItemDTO,
    index: number
  ) {
    if ((event.key !== "Enter" && !(isAssay && event.key === " ")) || isInteractive(event.target)) return;
    event.preventDefault();
    if (isAssay) onPick(record, index, event.shiftKey);
    else onOpen(record);
  }

  return (
    <TableBody>
      {/* Placeholder rows only when there is genuinely nothing yet: a
          refresh keeps the rows it has, because replacing readable data
          with a placeholder is a downgrade, not a loading state. */}
      {isLoading && !hasRecords ? (
        <TableSkeleton rows={10} columns={columnCount} />
      ) : !hasRecords ? (
        <TableRow>
          <TableCell colSpan={columnCount} className="h-40 text-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <span>{isFiltered ? t("emptyFiltered") : t("empty")}</span>
              {isFiltered ? (
                <Button variant="outline" size="sm" onClick={onResetFilters}>
                  {t("filters.reset")}
                </Button>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : (
        rows.map((record, rowIndex) => (
          <RecordRow
            key={record.id}
            record={record}
            index={rowIndex}
            isAssay={isAssay}
            canSelect={canSelect}
            isSelected={isSelected(record)}
            open={isOpen(record)}
            anySubs={anySubs}
            columns={shownColumns}
            pinSample={pinSample}
            formatDate={formatDate}
            onRowClick={handleRowClick}
            onRowKey={handleRowKey}
            onToggleBox={onToggleBox}
            onNoteShift={onNoteShift}
            onToggleSubs={onToggleSubs}
            onHistory={onHistory}
          />
        ))
      )}
    </TableBody>
  );
}
