"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { PageHeader } from "@/core/components/layout/page-header";
import { cn } from "@/core/lib/utils";
import { typesAddedIn, VIEWS } from "@/modules/eksplorasi/lib/data-source-columns";
import { SheetGrid } from "@/modules/eksplorasi/components/sheet/sheet-grid";
import { useDataSourceSheet } from "@/modules/eksplorasi/components/sheet/use-data-source-sheet";
import { useSheetTextSize } from "@/modules/eksplorasi/components/sheet/sheet-preferences";
import { SheetTabs } from "@/modules/eksplorasi/components/sheet/sheet-tabs";
import type { DataSourceDTO, DataSourceView, SheetStatus } from "@/modules/eksplorasi/types";
import { IoAddOutline, IoArrowBack, IoReloadOutline, IoSaveOutline } from "react-icons/io5";

const TONE: Record<SheetStatus, string> = {
  create: "text-primary",
  update: "text-emerald-700 dark:text-emerald-300",
  unchanged: "text-muted-foreground",
  invalid: "text-destructive",
};

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
 * The column headings' height as drawn: taller than the text size's own once a
 * heading wraps onto a second line. Null until the sheet is there.
 */
function useHeadingsHeight(loading: boolean) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (loading || typeof ResizeObserver === "undefined") return;
    const head = document.querySelector<HTMLElement>("[data-sheet-headings]");
    if (!head) return;
    const observer = new ResizeObserver(() => setHeight(head.offsetHeight));
    observer.observe(head);
    return () => observer.disconnect();
  }, [loading]);
  return height;
}

/**
 * Adding and changing a list's samples as in a spreadsheet, on a page of its
 * own, with the list's own columns: type or paste a block from Excel (with its
 * header or without) into the empty rows, each row checked as it lands. The
 * list's latest samples sit above, read-only unless they have no assay
 * results yet; one unlocked is changed in place
 * and saved with the rest. Opened from a sample's Ubah, that sample comes
 * already unlocked, with the cursor in it. On a QC list every row is that
 * list's type.
 *
 * A page rather than a dialog so a stray click or Esc cannot throw the work
 * away. The work is kept in this browser as it is typed, and valid rows are
 * saved on their own (useDataSourceSheet), so leaving -- Batal, the back
 * link, the sheet tabs under the grid, another menu -- loses nothing. The
 * text size is picked here too, for the screen at hand.
 */
export function DataSourceSheetPage({ view, editing }: { view: DataSourceView; editing?: DataSourceDTO }) {
  const t = useTranslations("dataSource");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const listPath = VIEWS[view].path;
  const sheet = useDataSourceSheet(view, () => router.push(listPath), editing);
  const { toolbarRef, toolbarTop, headingsTop } = useStickyOffsets();
  const textSize = useSheetTextSize();
  const headingsHeight = useHeadingsHeight(sheet.loading) ?? textSize.headingsHeight;

  function leave() {
    router.push(listPath);
  }

  // Straight into the sample being edited, or the first empty row, once it is
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
    ) : !sheet.isDirty ? (
      sheet.existing === 0 ? (
        t("sheet.nothing")
      ) : (
        [
          ...(sheet.lockedCount > 0 ? [t("sheet.lockedHint", { count: sheet.lockedCount })] : []),
          ...(sheet.openCount > 0 ? [t("sheet.openHint", { count: sheet.openCount })] : []),
        ].join(" ")
      )
    ) : null;

  const autosave = sheet.autosave.state;
  const saveState =
    autosave.status === "saving" ? (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <IoReloadOutline className="size-3.5 animate-spin" />
        {t("sheet.autosaving")}
      </span>
    ) : autosave.status === "saved" ? (
      <span className="text-xs">{t("sheet.autosavedAt", { time: format.dateTime(autosave.at, { hour: "2-digit", minute: "2-digit" }) })}</span>
    ) : autosave.status === "failed" ? (
      <span className="text-xs text-destructive">{t("sheet.autosaveFailed")}</span>
    ) : null;

  return (
    // The whole width of the window, past the app's 1280px column: two dozen columns need it.
    <div className="flex flex-col gap-4 mx-[calc(50%-50cqw+1rem)] sm:mx-[calc(50%-50cqw+1.5rem)]">
      <div>
        <button
          type="button"
          onClick={leave}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <IoArrowBack className="size-4" />
          {t(`views.${view}.title`)}
        </button>
        <PageHeader
          title={editing ? t("editTitle", { sampleId: editing.sampleId }) : t(`views.${view}.add`)}
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
              ? (Object.keys(TONE) as SheetStatus[])
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
            {saveState}
            {sheet.isDirty ? <span className="text-xs">{t("sheet.draftSaved")}</span> : null}
          </div>
          <div className="flex items-center rounded-xl border" role="group" aria-label={t("sheet.textSize")}>
            <Button variant="ghost" size="sm" aria-label={t("sheet.smaller")} title={t("sheet.smaller")} disabled={!textSize.canShrink} onClick={textSize.shrink}>
              A−
            </Button>
            <Button variant="ghost" size="sm" aria-label={t("sheet.larger")} title={t("sheet.larger")} disabled={!textSize.canGrow} onClick={textSize.grow}>
              A+
            </Button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={sheet.autosave.enabled}
              onChange={(event) => sheet.autosave.setEnabled(event.target.checked)}
            />
            {t("sheet.autosave")}
          </label>
          {sheet.canAddRows ? (
            <Button variant="ghost" size="sm" className="gap-1.5" disabled={sheet.isSaving || sheet.loading} onClick={sheet.addRows}>
              <IoAddOutline className="size-4" />
              {t("sheet.addRows")}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" disabled={sheet.isSaving || !sheet.isDirty} onClick={sheet.clearAll}>
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
          <div style={{ ...textSize.style, "--sheet-scroll-top": `${headingsTop + headingsHeight + 8}px` } as CSSProperties}>
            <SheetGrid
              fields={sheet.keys}
              fixedType={VIEWS[view].sampleType}
              // Every list whose Remarks is an OREAS one (not Duplicate's, which is about the original).
              oreasChoices={sheet.keys.includes("oreasRemarks") ? sheet.oreasNames : null}
              // Duplicate's Remarks: the original FIELD sample's Sample ID.
              pickSampleIds={sheet.keys.includes("originalSampleIdRemarks")}
              rows={sheet.rows}
              verdictFor={sheet.verdictFor}
              pending={sheet.isChecking}
              saving={sheet.isSaving}
              selectionFor={sheet.clipboard.selectionFor}
              fillHandleFor={sheet.clipboard.fillHandleFor}
              fillPreviewFor={sheet.clipboard.fillPreviewFor}
              typeChoices={typesAddedIn(view)}
              headerTop={headingsTop}
              containerProps={sheet.clipboard.containerProps}
              onCellChange={sheet.setCell}
              onToggleLock={sheet.toggleLock}
            />
          </div>
        )}
        <SheetTabs view={view} />
        <p className="mt-2 text-xs text-muted-foreground">{t("sheet.formats")}</p>
      </div>
    </div>
  );
}
