"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { PageHeader } from "@/core/components/layout/page-header";
import { ConfirmDialog } from "@/core/components/feedback/confirm-dialog";
import { cn } from "@/core/lib/utils";
import { DRILL_HOLE_FIELDS } from "@/modules/eksplorasi/lib/drill-hole-columns";
import { DrillSheetGrid } from "@/modules/eksplorasi/components/sheet/drill-sheet-grid";
import { useDrillSheet } from "@/modules/eksplorasi/components/sheet/use-drill-sheet";
import type { DrillHoleDTO, DrillSheetStatus } from "@/modules/eksplorasi/types";
import { IoAddOutline, IoArrowBack, IoReloadOutline, IoSaveOutline } from "react-icons/io5";

/** The list the sheet is opened from, and goes back to. */
export const DRILLING_LIST_PATH = "/eksplorasi/drilling";

const TONE: Record<DrillSheetStatus, string> = {
  create: "text-primary",
  update: "text-emerald-700 dark:text-emerald-300",
  unchanged: "text-muted-foreground",
  invalid: "text-destructive",
};

/**
 * Adding and changing drill holes as in a spreadsheet, on a page of its own:
 * type or paste a block from Excel (with its header or without) into the
 * empty rows, each row checked as it lands. The latest holes sit above,
 * read-only; one unlocked is changed in place and saved with the rest. Opened
 * from a hole's Ubah, that hole comes already unlocked, with the cursor in it.
 *
 * A page rather than a dialog so a stray click or Esc cannot throw the work
 * away. Leaving with unsaved work asks first: Batal and the back link here,
 * the browser itself on a reload or a closed tab (useDrillSheet).
 */
export function DrillHoleSheetPage({ editing }: { editing?: DrillHoleDTO }) {
  const t = useTranslations("drilling");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const sheet = useDrillSheet(() => router.push(DRILLING_LIST_PATH), editing);
  const [confirmLeave, setConfirmLeave] = useState(false);

  function leave() {
    if (sheet.isDirty) setConfirmLeave(true);
    else router.push(DRILLING_LIST_PATH);
  }

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
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={leave}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <IoArrowBack className="size-4" />
          {t("sheet.back")}
        </button>
        <PageHeader
          title={editing ? t("editTitle", { holeId: editing.holeId }) : t("sheet.addTitle")}
          subtitle={t("sheet.description", { count: sheet.existing })}
        />
      </div>

      <div className="flex min-h-6 flex-wrap items-center gap-2" aria-live="polite">
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

      {/* A box of its own height: the sheet scrolls inside it, header and row numbers held. */}
      <div className="relative flex h-[calc(100dvh-22rem)] min-h-96 flex-col">
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

      <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur-sm">
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
          <Button variant="outline" disabled={sheet.isSaving} onClick={leave}>
            {tCommon("cancel")}
          </Button>
          <Button className="gap-2" disabled={!sheet.canSave} onClick={() => void sheet.save()}>
            {sheet.isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : <IoSaveOutline className="size-4" />}
            {t("sheet.save", { count: sheet.writes })}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title={t("sheet.leaveTitle")}
        description={t("sheet.leaveBody")}
        confirmLabel={t("sheet.leave")}
        busy={false}
        onConfirm={() => router.push(DRILLING_LIST_PATH)}
        onClose={() => setConfirmLeave(false)}
      />
    </div>
  );
}
