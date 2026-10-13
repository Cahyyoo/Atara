"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Textarea } from "@/core/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import type { PasteRow } from "@/modules/lab/lib/records/paste-map";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import {
  IoClipboardOutline,
  IoDownloadOutline,
  IoReloadOutline,
  IoWarningOutline,
} from "react-icons/io5";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { withBasePath } from "@/core/lib/http/base-path";
import { MAX_KEYS } from "@/modules/lab/components/shared/paste-from-excel-utils";
import { PasteFromExcelPreview } from "@/modules/lab/components/shared/paste-from-excel-preview";
import { PasteOverwriteConfirm } from "@/modules/lab/components/shared/paste-overwrite-confirm";
import { usePasteFromExcel } from "@/modules/lab/components/shared/use-paste-from-excel";

interface PasteFromExcelProps {
  /**
   * The rows the operator ticked; the paste is applied to these and no others.
   * Empty: nothing was ticked, and the pasted Sample IDs find their own
   * records across the whole database.
   */
  records: LabRecordListItemDTO[];
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  /**
   * When given, the dialog fills instead of saving: the mapped rows are handed
   * back and the caller writes them into its own inputs, so nothing reaches the
   * server until that form is saved.
   *
   * The assay grid uses this — its whole shape is type, check, save, and a paste
   * that wrote straight through would skip the checking.
   */
  onFill?: (rows: PasteRow[]) => void;
}

export function PasteFromExcel({
  records,
  open,
  onClose,
  onApplied,
  onFill,
}: PasteFromExcelProps) {
  const t = useTranslations("database.paste");
  const tCommon = useTranslations("common");
  const {
    text,
    changeText,
    isBusy,
    error,
    confirm,
    setConfirm,
    free,
    freeProblem,
    resolving,
    result,
    toSave,
    tooMany,
    canApply,
    save,
    apply,
    close,
  } = usePasteFromExcel({ records, onClose, onApplied, onFill });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {free ? t("descriptionAll") : t("description", { count: records.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <Textarea
            aria-label={t("boxLabel")}
            placeholder={free ? t("placeholderAll") : t("placeholder")}
            // Ready for Ctrl+V the moment it opens: pasting is the only thing
            // this dialog is for.
            autoFocus
            wrap="off"
            className="h-28 overflow-auto font-mono text-xs"
            value={text}
            disabled={confirm !== null}
            onChange={(event) => changeText(event.target.value)}
          />

          <InlineNotice tone="error">{error}</InlineNotice>

          {freeProblem ? (
            <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <IoWarningOutline className="size-4 shrink-0" />
              {freeProblem === "needKey" ? t("needKey") : t("tooManyKeys", { max: MAX_KEYS })}
            </p>
          ) : resolving ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <IoReloadOutline className="size-4 animate-spin" />
              {t("resolving")}
            </p>
          ) : null}

          {confirm ? <PasteOverwriteConfirm confirm={confirm} /> : null}

          {result && !confirm ? (
            <PasteFromExcelPreview result={result} filling={Boolean(onFill)} tooMany={tooMany} saveCount={toSave.length} />
          ) : null}
        </div>

        <DialogFooter>
          {confirm ? (
            <>
              <Button variant="outline" className="sm:mr-auto" onClick={() => setConfirm(null)} disabled={isBusy}>
                {t("backToPreview")}
              </Button>
              <Button variant="outline" onClick={() => void save("keep")} disabled={isBusy}>
                {t("saveWithoutOverwrite")}
              </Button>
              <Button className="gap-2" onClick={() => void save("overwrite")} disabled={isBusy}>
                {isBusy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {t("overwriteAndSave")}
              </Button>
            </>
          ) : (
            <>
              {/*
                The instrument's own layout, with no sample named in it, for
                ticked rows: they are matched in order, so nothing in the sheet
                has to identify them. With nothing ticked, the sheet has to name
                its samples, so the template carries the key column.
              */}
              <Button
                variant="ghost"
                className="gap-2 sm:mr-auto"
                onClick={() => {
                  window.location.href = withBasePath(free
                    ? "/api/lab-records/template?shape=keyed"
                    : "/api/lab-records/template?shape=instrument");
                }}
              >
                <IoDownloadOutline className="size-4" />
                {t("downloadTemplate")}
              </Button>
              <Button variant="outline" onClick={close} disabled={isBusy}>
                {tCommon("cancel")}
              </Button>
              <Button className="gap-2" disabled={!canApply || isBusy} onClick={apply}>
                {isBusy ? (
                  <IoReloadOutline className="size-4 animate-spin" />
                ) : (
                  <IoClipboardOutline className="size-4" />
                )}
                {onFill ? t("fill", { count: toSave.length }) : t("apply", { count: toSave.length })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
