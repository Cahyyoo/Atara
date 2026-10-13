"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { IoArrowUndoOutline, IoClose, IoCreateOutline, IoReloadOutline, IoTrashOutline } from "react-icons/io5";
import { MATCH_LIMIT } from "@/modules/lab/components/shared/lab-records-table/columns";

/**
 * Only once something is ticked: an empty bar would just take up room
 * above the table on every visit. The identity change leads; removal
 * sits apart on the right, so the two are not mistaken for each other.
 */
export function SelectionBar({
  canEdit,
  showDeleted,
  selectedCount,
  sampleCount,
  subCount,
  isRemoving,
  showMatching,
  allMatchingSelected,
  isSelectingMatching,
  total,
  pageCount,
  onBulkIdentity,
  onClear,
  onConfirm,
  onSelectAllMatching,
}: {
  canEdit: boolean;
  showDeleted: boolean;
  selectedCount: number;
  sampleCount: number;
  subCount: number;
  isRemoving: boolean;
  /** The whole page is ticked and the filters match more than it shows. */
  showMatching: boolean;
  allMatchingSelected: boolean;
  isSelectingMatching: boolean;
  total: number;
  /** How many records this page shows. */
  pageCount: number;
  onBulkIdentity: () => void;
  onClear: () => void;
  onConfirm: (what: "samples" | "subs") => void;
  onSelectAllMatching: () => void;
}) {
  const t = useTranslations("database");

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {t("selectedCount", { count: selectedCount })}
        </span>
        {/* Samples only: a sub-sample's identity is its parent's. */}
        {!showDeleted && canEdit && sampleCount > 0 ? (
          <Button size="sm" className="gap-2" onClick={onBulkIdentity}>
            <IoCreateOutline className="size-4" />
            {t("bulkIdentity.open", { count: sampleCount })}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClear}>
          <IoClose className="size-4" />
          {t("clearSelection")}
        </Button>
        <Button
          size="sm"
          variant={showDeleted ? "default" : "destructive"}
          className="ml-auto gap-2"
          disabled={isRemoving || sampleCount === 0}
          onClick={() => onConfirm("samples")}
        >
          {showDeleted ? <IoArrowUndoOutline className="size-4" /> : <IoTrashOutline className="size-4" />}
          {showDeleted ? t("restore") : t("remove")}
        </Button>
        {!showDeleted && subCount > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-destructive"
            disabled={isRemoving}
            onClick={() => onConfirm("subs")}
          >
            <IoTrashOutline className="size-4" />
            {t("subs.remove", { count: subCount })}
          </Button>
        ) : null}
      </div>
      {/* The whole page is ticked and the filters match more than it
          shows: offer the rest, the way a mail client does. */}
      {showMatching ? (
        <p className="text-xs text-muted-foreground">
          {allMatchingSelected ? (
            <>
              {total > MATCH_LIMIT
                ? t("selection.firstMatchingSelected", { count: selectedCount, total })
                : t("selection.allMatchingSelected", { count: selectedCount })}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={onClear}
              >
                {t("selection.clear")}
              </button>
            </>
          ) : (
            <>
              {t("selection.allOnPage", { count: pageCount })}{" "}
              <button
                type="button"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-60"
                disabled={isSelectingMatching}
                onClick={onSelectAllMatching}
              >
                {isSelectingMatching ? <IoReloadOutline aria-hidden className="size-3 animate-spin" /> : null}
                {total > MATCH_LIMIT
                  ? t("selection.selectFirstMatching", { count: MATCH_LIMIT, total })
                  : t("selection.selectAllMatching", { count: total })}
              </button>
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
