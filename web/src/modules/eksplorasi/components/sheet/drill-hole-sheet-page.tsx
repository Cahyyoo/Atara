"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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

/** Height of the sheet's column headings (h-12), held under the bars above them. */
const HEADINGS_HEIGHT = 48;

/**
 * How far down the window the page's own sticky bars go: the toolbar right
 * under the app's header, the sheet's headings right under the toolbar.
 * Measured rather than guessed -- the app's header is taller where the module
 * tabs show -- and measured again whenever either changes size.
 */
function useStickyOffsets() {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState({ header: 0, toolbar: 0 });
  useEffect(() => {
    const appHeader = document.querySelector<HTMLElement>("[data-app-header]");
    const toolbar = toolbarRef.current;
    const measure = () => setHeights({ header: appHeader?.offsetHeight ?? 0, toolbar: toolbar?.offsetHeight ?? 0 });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (appHeader) observer.observe(appHeader);
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);
  return { toolbarRef, toolbarTop: heights.header, headingsTop: heights.header + heights.toolbar };
}

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
  const { toolbarRef, toolbarTop, headingsTop } = useStickyOffsets();

  function leave() {
    if (sheet.isDirty) setConfirmLeave(true);
    else router.push(DRILLING_LIST_PATH);
  }

  // Straight into the hole being edited, or the first empty row, once it is
  // there -- so typing, or Ctrl+V, works at once -- with the page scrolled to
  // bring that row to the middle of the screen.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (sheet.loading || focused) return;
    const row = sheet.focusRow;
    const frame = requestAnimationFrame(() => {
      const cell = document.querySelector<HTMLInputElement>(`[data-cell-row="${row}"][data-cell-col="0"]`);
      cell?.focus({ preventScroll: true });
      cell?.scrollIntoView?.({ block: "center" });
      setFocused(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [sheet.loading, sheet.focusRow, focused]);

  const summary = sheet.summary;
  const hint =
    summary && summary.invalid > 0 ? (
      <span className="text-destructive">{t("sheet.fixInvalid", { count: summary.invalid })}</span>
    ) : !sheet.hasActive ? (
      sheet.existing > 0 ? t("sheet.lockedHint", { count: sheet.existing }) : t("sheet.nothing")
    ) : null;

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
          subtitle={t("sheet.description")}
        />
      </div>

      <InlineNotice tone="error">{sheet.error}</InlineNotice>

      <div className="flex flex-col">
        {/* What the sheet would do and its buttons, Save among them, held under
            the app's header while the page scrolls down a long sheet. */}
        <div
          ref={toolbarRef}
          style={{ top: toolbarTop }}
          className="sticky z-20 -mx-4 flex flex-wrap items-center gap-2 bg-canvas/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6"
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {summary
              ? (Object.keys(TONE) as DrillSheetStatus[])
                  .filter((status) => summary[status] > 0)
                  .map((status) => (
                    <span key={status} className={cn("rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium", TONE[status])}>
                      {t(`sheet.counts.${status}`, { count: summary[status] })}
                    </span>
                  ))
              : null}
            {sheet.isChecking ? (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <IoReloadOutline className="size-3.5 animate-spin" />
                {t("sheet.checking")}
              </span>
            ) : null}
            {hint}
          </div>
          {sheet.canAddRows ? (
            <Button variant="ghost" size="sm" className="gap-1.5" disabled={sheet.isSaving || sheet.loading} onClick={sheet.addRows}>
              <IoAddOutline className="size-4" />
              {t("sheet.addRows")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" disabled={sheet.isSaving || !sheet.hasActive} onClick={sheet.clearAll}>
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

        {sheet.loading ? (
          <div className="flex h-64 items-center justify-center gap-2 rounded-xl border text-sm text-muted-foreground">
            <IoReloadOutline className="size-4 animate-spin" />
            {t("sheet.loading")}
          </div>
        ) : (
          // A box moved into is scrolled clear of the bars stuck above it.
          <div style={{ "--sheet-scroll-top": `${headingsTop + HEADINGS_HEIGHT + 8}px` } as CSSProperties}>
            <DrillSheetGrid
              fields={DRILL_HOLE_FIELDS}
              rows={sheet.rows}
              verdictFor={sheet.verdictFor}
              pending={sheet.isChecking}
              saving={sheet.isSaving}
              selectionFor={sheet.clipboard.selectionFor}
              headerTop={headingsTop}
              containerProps={sheet.clipboard.containerProps}
              onCellChange={sheet.setCell}
              onToggleLock={sheet.toggleLock}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("sheet.formats")}</p>
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
