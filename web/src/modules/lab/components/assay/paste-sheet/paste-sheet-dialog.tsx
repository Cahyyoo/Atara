"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/core/components/ui/dialog";
import { ResultsColumnPicker } from "@/modules/lab/components/assay/results-column-picker";
import { PasteImportSaveBar } from "@/modules/lab/components/assay/paste-import-save-bar";
import { numberProblem } from "@/modules/lab/components/assay/results-grid";
import { SheetGrid, type CellCheck, type SheetColumn } from "@/modules/lab/components/assay/paste-sheet/sheet-grid";
import { SheetSummary } from "@/modules/lab/components/assay/paste-sheet/sheet-status";
import { SheetBusy, SheetProgressBar, SheetSkeleton } from "@/modules/lab/components/assay/paste-sheet/sheet-busy";
import { usePasteSheet } from "@/modules/lab/components/assay/paste-sheet/use-paste-sheet";
import { SHEET_MAX_ROWS, sheetLabel } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import { readMeasurementFinished } from "@/modules/lab/lib/records/measurement-time";
import { downloadFromApi } from "@/core/lib/http/download";
import { IoAddOutline, IoClipboardOutline, IoDownloadOutline } from "react-icons/io5";

/** A column of the sheet as it is shown: its heading as the instrument's sheet writes it. */
function sheetColumn(key: string): SheetColumn {
  const assay = ASSAY_FIELDS.find((field) => field.key === key);
  if (key === "sampleIdent") return { key, label: sheetLabel(key), kind: "key" };
  if (assay) return { key, label: sheetLabel(key), kind: "number", max: assay.max };
  if (key === "measurementFinished") return { key, label: sheetLabel(key), kind: "date" };
  return { key, label: sheetLabel(key), kind: "text" };
}

/**
 * Pasting results by Sample ID, into a sheet rather than a text box.
 *
 * Headed exactly as the instrument's export is -- Measurement Finished, Ni (%)
 * through Sum (%), Measurement Method, Solution ID -- with the Sample ID in
 * front. A block copied from Excel, with its header or without, is pasted
 * into any box and spreads across the sheet, which grows to fit it (up to five
 * thousand rows). Rows are checked by the server as they land, only the ones
 * that changed, and each verdict is painted onto its row; Save writes them all
 * in one go. Anything that takes a moment says so while it happens.
 */
export function PasteSheetDialog({
  open,
  onClose,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: (count: number) => void;
}) {
  const t = useTranslations("assay.sheet");
  const tAssay = useTranslations("assay");
  const tPaste = useTranslations("assay.paste");
  const format = useFormatter();
  const sheet = usePasteSheet(onApplied);
  const { showRemarks, visible, toggleColumn } = sheet.columnsState;

  const columns = useMemo(() => sheet.keys.map(sheetColumn), [sheet.keys]);

  // Checked in the browser as it is typed, before the server answers: a
  // number that is not one, a date the import cannot read or that lies ahead.
  // The date's reading is offered as the tooltip, so month-first is visible.
  const checkCell = useMemo<CellCheck>(
    () => (column, value) => {
      if (value.trim() === "") return { problem: null };
      if (column.kind === "number") {
        const problem = numberProblem(value, column.max ?? 100);
        if (problem === "notNumber") return { problem: tAssay("cell.notNumber") };
        if (problem === "tooManyDecimals") return { problem: tAssay("cell.tooManyDecimals") };
        if (problem === "outOfRange") return { problem: tAssay("cell.outOfRange", { max: column.max ?? 100 }) };
        return { problem: null };
      }
      if (column.kind === "date") {
        const read = readMeasurementFinished(value);
        if (!read.ok) return { problem: read.reason === "future" ? t("dateFuture") : t("dateUnreadable") };
        const date = format.dateTime(read.value, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });
        return { problem: null, hint: t("dateHint", { date }) };
      }
      return { problem: null };
    },
    [t, tAssay, format]
  );

  // The grid waits for the dialog to finish opening. Hundreds of boxes drawn
  // in the same frames as the opening animation made it stutter; a light
  // outline of the sheet is drawn meanwhile, and the real one follows within
  // a fifth of a second. The timer is the fallback for when no animation runs
  // (reduced motion, tests), so the sheet is never left waiting.
  const [ready, setReady] = useState(false);
  // As a transition, so React draws the grid in small slices between frames
  // instead of one long block the browser cannot paint through.
  const settle = (isOpen: boolean) => startTransition(() => setReady(isOpen));
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => startTransition(() => setReady(true)), 320);
    return () => clearTimeout(timer);
  }, [open]);

  // Then straight into the first box, so Ctrl+V works the moment it is there.
  useEffect(() => {
    if (!open || !ready) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('[data-cell-row="0"][data-cell-col="0"]')?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [open, ready]);

  const { filled, checked } = sheet.progress;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next && !sheet.isSaving ? onClose() : undefined)}
      // Ready once it has finished opening; back to the outline once it has
      // closed, so opening it again is as smooth as the first time.
      onOpenChangeComplete={settle}
    >
      <DialogContent
        // A big surface rises and fades in rather than zooming from 95%: only
        // transform and opacity move, and slowly enough to read as one motion.
        //
        // Centred by its margins, not by the dialog's usual -50% translate: half
        // of a box this size is nearly always a fraction of a pixel, and text
        // shifted by a fraction is drawn blurred. No will-change either -- it
        // kept the box on its own layer after the animation, blur and all.
        className="inset-0 m-auto flex h-[92dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-4 duration-200! ease-out data-open:slide-in-from-bottom-2 data-open:zoom-in-98! data-closed:zoom-out-98! sm:max-w-[min(96vw,1400px)]"
        overlayClassName="backdrop-blur-none"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <IoClipboardOutline aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("description", { max: SHEET_MAX_ROWS })} <strong className="font-medium">{t("pasteOnly")}</strong>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {sheet.summary ? <SheetSummary summary={sheet.summary} /> : null}
          {sheet.isChecking ? <SheetProgressBar done={checked} total={filled} label={t("checkingProgress", { done: checked, total: filled })} /> : null}
          <div className="ml-auto flex flex-wrap gap-2">
            <ResultsColumnPicker visible={visible} showRemarks={showRemarks} onToggle={toggleColumn} />
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void downloadFromApi("/api/lab-records/template?shape=keyed", "assay-template.xlsx")}
            >
              <IoDownloadOutline className="size-4" />
              {tPaste("downloadTemplate")}
            </Button>
          </div>
        </div>

        <InlineNotice tone="error">{sheet.error}</InlineNotice>
        {sheet.tooMany ? (
          <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {t("tooMany", { max: SHEET_MAX_ROWS })}
          </p>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col">
          {ready ? (
            <SheetGrid
              columns={columns}
              rows={sheet.rows}
              verdictFor={sheet.verdictFor}
              duplicatesFor={sheet.duplicatesFor}
              pending={sheet.isChecking}
              locked={sheet.isSaving}
              checkCell={checkCell}
              selectionFor={sheet.clipboard.selectionFor}
              scrollerRef={sheet.virtual.scrollerRef}
              onScroll={sheet.virtual.onScroll}
              start={sheet.virtual.start}
              end={sheet.virtual.end}
              padTop={sheet.virtual.padTop}
              padBottom={sheet.virtual.padBottom}
              containerProps={sheet.clipboard.containerProps}
              onCellChange={sheet.setCell}
            />
          ) : (
            <SheetSkeleton columns={columns.map((column) => column.label)} />
          )}
          {sheet.pasting > 0 ? <SheetBusy label={t("pasting", { count: sheet.pasting })} /> : null}
          {sheet.isSaving ? <SheetBusy label={t("saving", { count: sheet.writes })} /> : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 self-start" disabled={sheet.isSaving} onClick={sheet.addRows}>
            <IoAddOutline className="size-4" />
            {t("addRows")}
          </Button>
          {sheet.summary ? (
            <PasteImportSaveBar
              summary={sheet.summary}
              writes={sheet.writes}
              confirmOverwrite={sheet.confirmOverwrite}
              isSaving={sheet.isSaving}
              canSave={sheet.canSave}
              onCancelOverwrite={() => sheet.setConfirmOverwrite(false)}
              onSave={(overwrite) => sheet.save(overwrite)}
              onClear={sheet.clearAll}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
