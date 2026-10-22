"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { useDataSourceImport } from "@/modules/eksplorasi/components/import/use-data-source-import";
import { ImportFilePicker } from "@/modules/eksplorasi/components/import/import-file-picker";
import { ImportPreview } from "@/modules/eksplorasi/components/import/import-preview";
import { ImportProgress, ImportResult } from "@/modules/eksplorasi/components/import/import-status";
import type { DataSourceView } from "@/modules/eksplorasi/types";
import { IoReloadOutline } from "react-icons/io5";

/**
 * Importing a sheet into one list: pick a file, see what it would do, then do
 * it with a progress bar. Rows that are wrong are left out and handed back as
 * a CSV to fix and import again. The flow lives in useDataSourceImport; this
 * only lays out its steps.
 */
export function DataSourceImportDialog({
  view,
  open,
  onClose,
  onImported,
}: {
  view: DataSourceView;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations("dataSource.import");
  const tViews = useTranslations("dataSource.views");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const flow = useDataSourceImport(view, onImported);
  const { step, preview, busy } = flow;

  function close() {
    if (busy) return;
    flow.reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? close() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { list: tViews(`${view}.title`) })}</DialogTitle>
          <DialogDescription>{t(view === "dataSource" ? "description" : "descriptionQc")}</DialogDescription>
        </DialogHeader>

        {step.kind === "done" ? (
          <ImportResult result={step.result} />
        ) : (
          <div className="flex flex-col gap-4">
            <ImportFilePicker view={view} file={flow.file} disabled={busy} onChoose={(file) => void flow.choose(file)} onError={flow.setError} />
            {step.kind === "previewing" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <IoReloadOutline className="size-4 animate-spin" />
                {t("reading")}
              </p>
            ) : null}
            {preview ? (
              <ImportPreview
                preview={preview}
                updateExisting={flow.updateExisting}
                disabled={busy}
                onUpdateExisting={flow.setUpdateExisting}
              />
            ) : null}
            {step.kind === "importing" ? <ImportProgress done={step.done} total={step.total} /> : null}
          </div>
        )}

        <InlineNotice tone="error">{flow.error}</InlineNotice>

        <DialogFooter>
          {step.kind === "done" ? (
            <>
              <Button type="button" variant="outline" onClick={flow.reset}>
                {t("another")}
              </Button>
              <Button type="button" onClick={close}>
                {tCommon("close")}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={close} disabled={busy}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" className="gap-2" disabled={busy || flow.writes === 0} onClick={() => void flow.run()}>
                {step.kind === "importing" ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {preview ? t("run", { count: format.number(flow.writes) }) : t("runEmpty")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
