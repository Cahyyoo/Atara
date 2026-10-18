"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/core/components/ui/dialog";
import { cn } from "@/core/lib/utils";
import { DRILL_HOLE_FIELDS } from "@/modules/eksplorasi/lib/drill-hole-columns";
import { DrillSheetGrid } from "@/modules/eksplorasi/components/sheet/drill-sheet-grid";
import { useDrillSheet } from "@/modules/eksplorasi/components/sheet/use-drill-sheet";
import type { DrillHoleDTO, DrillSheetStatus } from "@/modules/eksplorasi/types";
import { IoAddOutline, IoReloadOutline, IoSaveOutline } from "react-icons/io5";

const TONE: Record<DrillSheetStatus, string> = {
  create: "text-primary",
  update: "text-emerald-700 dark:text-emerald-300",
  unchanged: "text-muted-foreground",
  invalid: "text-destructive",
};

/**
 * Adding drill holes as in a spreadsheet: type or paste a block from Excel
 * (with its header or without) into the empty rows, each row checked as it
 * lands. The latest holes sit above, read-only; one unlocked is changed in
 * place and saved with the rest. Opened from a hole's Ubah, that hole comes
 * already unlocked, with the cursor in it. Mounted only while open, so it
 * opens fresh.
 */
export function DrillHoleSheetDialog({
  editing,
  onClose,
  onSaved,
}: {
  /** The hole whose Ubah opened the sheet; absent when it was opened to add. */
  editing?: DrillHoleDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("drilling");
  const tCommon = useTranslations("common");
  const sheet = useDrillSheet(() => {
    onSaved();
    onClose();
  }, editing);

  // Straight into the hole being edited, or the first empty row, once it is
  // there -- so typing, or Ctrl+V, works at once.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (sheet.loading || focused) return;
    const row = sheet.focusRow;
    const frame = requestAnimationFrame(() => {
      sheet.virtual.scrollToRow(row);
      requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>(`[data-cell-row="${row}"][data-cell-col="0"]`)?.focus()
      );
      setFocused(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [sheet.loading, sheet.focusRow, sheet.virtual, focused]);

  const summary = sheet.summary;

  return (
    <Dialog open onOpenChange={(next) => (!next && !sheet.isSaving ? onClose() : undefined)}>
      <DialogContent
        className="inset-0 m-auto flex h-[92dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-4 sm:max-w-[min(96vw,1400px)]"
        overlayClassName="backdrop-blur-none"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{editing ? t("editTitle", { holeId: editing.holeId }) : t("sheet.title")}</DialogTitle>
          <DialogDescription>{t("sheet.description", { count: sheet.existing })}</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2" aria-live="polite">
          {summary ? (
            (Object.keys(TONE) as DrillSheetStatus[])
              .filter((status) => summary[status] > 0)
              .map((status) => (
                <span key={status} className={cn("rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium", TONE[status])}>
                  {t(`sheet.counts.${status}`, { count: summary[status] })}
                </span>
              ))
          ) : sheet.isChecking ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <IoReloadOutline className="size-3.5 animate-spin" />
              {t("sheet.checking")}
            </span>
          ) : null}
        </div>

        <InlineNotice tone="error">{sheet.error}</InlineNotice>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {sheet.loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 rounded-xl border text-sm text-muted-foreground">
              <IoReloadOutline className="size-4 animate-spin" />
              {t("sheet.loading")}
            </div>
          ) : (
            <DrillSheetGrid
              fields={DRILL_HOLE_FIELDS}
              rows={sheet.rows}
              verdictFor={sheet.verdictFor}
              pending={sheet.isChecking}
              saving={sheet.isSaving}
              selectionFor={sheet.clipboard.selectionFor}
              scrollerRef={sheet.virtual.scrollerRef}
              onScroll={sheet.virtual.onScroll}
              start={sheet.virtual.start}
              end={sheet.virtual.end}
              padTop={sheet.virtual.padTop}
              padBottom={sheet.virtual.padBottom}
              containerProps={sheet.clipboard.containerProps}
              onCellChange={sheet.setCell}
              onToggleLock={sheet.toggleLock}
            />
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {sheet.canAddRows ? (
            <Button variant="ghost" size="sm" className="gap-1.5" disabled={sheet.isSaving || sheet.loading} onClick={sheet.addRows}>
              <IoAddOutline className="size-4" />
              {t("sheet.addRows")}
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {summary && summary.invalid > 0
              ? t("sheet.fixInvalid", { count: summary.invalid })
              : sheet.hasActive
                ? null
                : t("sheet.nothing")}
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" disabled={sheet.isSaving || !sheet.hasActive} onClick={sheet.clearAll}>
              {t("sheet.clear")}
            </Button>
            <Button variant="outline" disabled={sheet.isSaving} onClick={onClose}>
              {tCommon("cancel")}
            </Button>
            <Button className="gap-2" disabled={!sheet.canSave} onClick={() => void sheet.save()}>
              {sheet.isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : <IoSaveOutline className="size-4" />}
              {t("sheet.save", { count: sheet.writes })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
