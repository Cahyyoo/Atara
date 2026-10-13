"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/core/components/ui/dialog";
import { ResultsColumnPicker } from "@/modules/lab/components/assay/results-column-picker";
import { PasteImportSaveBar } from "@/modules/lab/components/assay/paste-import-save-bar";
import { SheetGrid, type SheetColumn } from "@/modules/lab/components/assay/paste-sheet/sheet-grid";
import { SheetSummary } from "@/modules/lab/components/assay/paste-sheet/sheet-status";
import { usePasteSheet } from "@/modules/lab/components/assay/paste-sheet/use-paste-sheet";
import { SHEET_MAX_ROWS } from "@/modules/lab/components/assay/paste-sheet/sheet-text";
import { downloadFromApi } from "@/core/lib/http/download";
import { IoAddOutline, IoClipboardOutline, IoDownloadOutline, IoReloadOutline } from "react-icons/io5";

/**
 * Pasting results by Sample ID, into a sheet rather than a text box.
 *
 * Rows and columns, as in Excel: the Sample ID first, then the result columns
 * chosen with the picker. A block copied from Excel -- with its header or
 * without -- is pasted into any box and spreads across the sheet, which grows
 * to fit it (up to five thousand rows). Boxes can be selected and copied back
 * out. Every row is checked by the server as it lands, and its verdict is
 * painted onto the row itself; Save writes them all in one go.
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
  const tPaste = useTranslations("assay.paste");
  const tDatabase = useTranslations("database");
  const sheet = usePasteSheet(onApplied);
  const { columns, instrumentColumns, showRemarks, visible, toggleColumn } = sheet.columnsState;

  const sheetColumns = useMemo<SheetColumn[]>(
    () => [
      { key: "sampleIdent", label: "Sample ID", kind: "key" },
      ...columns.map((field) => ({
        key: field.key,
        label: field.key === "sum" ? field.shortLabel : `${field.shortLabel} %`,
        kind: "number" as const,
      })),
      ...instrumentColumns.map((field) => ({
        key: field.key,
        label: field.label,
        kind: field.kind === "datetime" ? ("datetime" as const) : ("text" as const),
      })),
      ...(showRemarks ? [{ key: "remarks", label: tDatabase("dialog.remarks"), kind: "text" as const }] : []),
    ],
    [columns, instrumentColumns, showRemarks, tDatabase]
  );

  // Straight into the first box, so Ctrl+V works the moment the sheet opens.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('[data-cell-row="0"][data-cell-col="0"]')?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
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
          {sheet.isChecking ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IoReloadOutline aria-hidden className="size-3.5 animate-spin" />
              {tPaste("checking")}
            </span>
          ) : null}
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

        <SheetGrid
          columns={sheetColumns}
          rows={sheet.rows}
          verdicts={sheet.verdicts}
          pending={sheet.isChecking}
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

        <div className="flex shrink-0 flex-col gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 self-start" onClick={sheet.addRows}>
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
