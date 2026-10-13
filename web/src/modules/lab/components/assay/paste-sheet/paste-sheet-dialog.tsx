"use client";

import { useEffect, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/core/components/ui/dialog";
import { ResultsColumnPicker } from "@/modules/lab/components/assay/results-column-picker";
import { PasteImportSaveBar } from "@/modules/lab/components/assay/paste-import-save-bar";
import { numberProblem } from "@/modules/lab/components/assay/results-grid";
import { SheetGrid, type CellCheck, type SheetColumn } from "@/modules/lab/components/assay/paste-sheet/sheet-grid";
import { SheetSummary } from "@/modules/lab/components/assay/paste-sheet/sheet-status";
import { SheetBusy, SheetProgressBar } from "@/modules/lab/components/assay/paste-sheet/sheet-busy";
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

  // Straight into the first box, so Ctrl+V works the moment the sheet opens.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('[data-cell-row="0"][data-cell-col="0"]')?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const { filled, checked } = sheet.progress;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !sheet.isSaving ? onClose() : undefined)}>
      <DialogContent className="flex h-[92dvh] max-w-none flex-col gap-4 sm:max-w-[min(96vw,1400px)]" overlayClassName="backdrop-blur-none">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <IoClipboardOutline aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("description", { max: SHEET_MAX_ROWS })}
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
          <SheetGrid
            columns={columns}
            rows={sheet.rows}
            verdictFor={sheet.verdictFor}
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
