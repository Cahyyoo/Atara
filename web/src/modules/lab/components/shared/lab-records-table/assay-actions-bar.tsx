"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { IoClose, IoPencilOutline, IoTrashOutline } from "react-icons/io5";

/**
 * The entry list's actions, pinned to the bottom while anything is ticked
 * so they are beside the rows being picked. One way in: the entry grid, where
 * results are typed or a block from Excel is pasted straight into the boxes.
 * (Results by Sample ID, with nothing ticked, go through the paste sheet.)
 */
export function AssayActionsBar({
  selectedRecords,
  subCount,
  isRemoving,
  onClear,
  onRemoveSubs,
  onEnterResults,
}: {
  selectedRecords: LabRecordListItemDTO[];
  subCount: number;
  isRemoving: boolean;
  onClear: () => void;
  onRemoveSubs: () => void;
  onEnterResults?: (records: LabRecordListItemDTO[]) => void;
}) {
  const t = useTranslations("database");

  return (
    <div data-tour="assay-actions" className="sticky bottom-3 z-20 order-last flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 px-4 py-3 shadow-raised backdrop-blur-sm">
      <span className="text-sm font-medium">{t("selectedCount", { count: selectedRecords.length })}</span>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClear}>
        <IoClose className="size-4" />
        {t("clearSelection")}
      </Button>
      <div className="ml-auto flex flex-wrap gap-2">
        {onEnterResults ? (
          <Button className="gap-2" onClick={() => onEnterResults(selectedRecords)}>
            <IoPencilOutline className="size-4" />
            {t("enterManually")}
          </Button>
        ) : null}
        {subCount > 0 ? (
          <Button
            variant="outline"
            className="gap-2 text-destructive"
            disabled={isRemoving}
            onClick={onRemoveSubs}
          >
            <IoTrashOutline className="size-4" />
            {t("subs.remove", { count: subCount })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
