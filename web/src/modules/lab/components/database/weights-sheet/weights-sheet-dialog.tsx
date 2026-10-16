"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/core/components/ui/dialog";
import { PasteImportSaveBar } from "@/modules/lab/components/assay/paste-import-save-bar";
import { SheetGrid, type CellCheck, type SheetColumn } from "@/modules/lab/components/assay/paste-sheet/sheet-grid";
import { SheetSummary } from "@/modules/lab/components/assay/paste-sheet/sheet-status";
import { SheetBusy, SheetProgressBar, SheetSkeleton } from "@/modules/lab/components/assay/paste-sheet/sheet-busy";
import { WEIGHTS_MAX_ROWS, useWeightsSheet } from "@/modules/lab/components/database/weights-sheet/use-weights-sheet";
import { weightProblem } from "@/modules/lab/components/database/weights-sheet/use-weights-check";
import { IoAddOutline, IoClipboardOutline } from "react-icons/io5";

const COLUMNS: readonly SheetColumn[] = [
  { key: "sampleIdent", label: "Sample ID", kind: "key" },
  { key: "wp", label: "Wp", kind: "number", typed: true },
  { key: "w0", label: "W0", kind: "number", typed: true },
  { key: "wd", label: "Wd", kind: "number", typed: true },
];

const noDuplicates = () => undefined;

/**
 * Wp, W0 and Wd for many samples at once, in a sheet like the results paste:
 * a block copied from Excel -- with its header or without -- pasted into any
 * box spreads across the sheet, and each row is checked by the server as it
 * lands. The weighings may be typed too. Save writes only the rows that change
 * something.
 */
export function PasteWeightsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("database.weights");
  const tSheet = useTranslations("assay.sheet");
  const sheet = useWeightsSheet({
    open,
    onSaved: () => {
      onSaved();
      onClose();
    },
  });

  const checkCell = useMemo<CellCheck>(
    () => (column, value) => {
      if (column.kind !== "number") return { problem: null };
      const problem = weightProblem(value);
      return { problem: problem ? t(problem) : null };
    },
    [t]
  );

  // The grid waits for the dialog to finish opening, as the results sheet does.
  const [ready, setReady] = useState(false);
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

  function close() {
    if (sheet.isSaving) return;
    sheet.reset();
    onClose();
  }

  const { filled, checked } = sheet.progress;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)} onOpenChangeComplete={settle}>
      <DialogContent
        className="inset-0 m-auto flex h-[85dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-4 duration-200! ease-out data-open:slide-in-from-bottom-2 data-open:zoom-in-98! data-closed:zoom-out-98! sm:max-w-[min(96vw,900px)]"
        overlayClassName="backdrop-blur-none"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <IoClipboardOutline aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{t("description", { max: WEIGHTS_MAX_ROWS })}</span>
          </DialogDescription>
        </DialogHeader>

        {sheet.summary || sheet.isChecking ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {sheet.summary ? <SheetSummary summary={sheet.summary} /> : null}
            {sheet.isChecking ? (
              <SheetProgressBar
                done={checked}
                total={filled}
                label={tSheet("checkingProgress", { done: checked, total: filled })}
              />
            ) : null}
          </div>
        ) : null}

        <InlineNotice tone="error">{sheet.error}</InlineNotice>
        {sheet.tooMany ? (
          <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {t("tooManyRows", { max: WEIGHTS_MAX_ROWS })}
          </p>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col">
          {ready ? (
            <SheetGrid
              columns={COLUMNS}
              rows={sheet.rows}
              verdictFor={sheet.verdictFor}
              duplicatesFor={noDuplicates}
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
            <SheetSkeleton columns={COLUMNS.map((column) => column.label)} />
          )}
          {sheet.isSaving ? <SheetBusy label={tSheet("saving", { count: sheet.writes })} /> : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {sheet.rows.length < WEIGHTS_MAX_ROWS ? (
            <Button variant="ghost" size="sm" className="gap-1.5 self-start" disabled={sheet.isSaving} onClick={sheet.addRows}>
              <IoAddOutline className="size-4" />
              {tSheet("addRows")}
            </Button>
          ) : null}
          {sheet.summary ? (
            <PasteImportSaveBar
              summary={sheet.summary}
              writes={sheet.writes}
              confirmOverwrite={false}
              isSaving={sheet.isSaving}
              canSave={sheet.canSave}
              onCancelOverwrite={() => {}}
              onSave={() => sheet.save()}
              onClear={sheet.clearAll}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
