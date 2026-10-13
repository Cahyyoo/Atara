"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import type { ImportPreviewDTO } from "@/modules/lab/types";
import { IoReloadOutline, IoSaveOutline, IoWarningOutline } from "react-icons/io5";

interface PasteImportSaveBarProps {
  summary: ImportPreviewDTO["summary"];
  writes: number;
  confirmOverwrite: boolean;
  isSaving: boolean;
  canSave: boolean;
  onCancelOverwrite: () => void;
  onSave: (overwrite?: boolean) => Promise<void>;
  onClear: () => void;
}

/** What a save would do, and the buttons that do it. */
export function PasteImportSaveBar({
  summary,
  writes,
  confirmOverwrite,
  isSaving,
  canSave,
  onCancelOverwrite,
  onSave,
  onClear,
}: PasteImportSaveBarProps) {
  const t = useTranslations("assay.paste");
  const tCommon = useTranslations("common");

  return (
    // Pinned while there is something to decide, so Save is never a
    // scroll away from the preview it confirms.
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-raised backdrop-blur-sm">
      {confirmOverwrite ? (
        <span role="alert" className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <IoWarningOutline className="size-4 shrink-0" />
          {t("overwriteConfirm", { count: summary.overwrite ?? 0 })}
        </span>
      ) : summary.invalid > 0 ? (
        <span className="flex items-center gap-2 text-sm text-destructive">
          <IoWarningOutline className="size-4 shrink-0" />
          {t("fixInvalid", { count: summary.invalid })}
        </span>
      ) : writes === 0 ? (
        <span className="text-sm text-muted-foreground">{t("nothingToSave")}</span>
      ) : (
        <span className="text-sm">
          <span className="font-medium">{t("ready", { count: writes })}</span>
          {summary.unknown > 0 ? (
            <span className="text-muted-foreground"> · {t("skipped", { count: summary.unknown })}</span>
          ) : null}
        </span>
      )}
      {confirmOverwrite ? (
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={isSaving} onClick={onCancelOverwrite}>
            {tCommon("cancel")}
          </Button>
          <Button className="gap-2" disabled={isSaving} onClick={() => void onSave(true)}>
            {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {t("overwriteAndSave")}
          </Button>
        </div>
      ) : (
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" disabled={isSaving} onClick={onClear}>
            {t("clear")}
          </Button>
          <Button className="gap-2" disabled={!canSave || isSaving} onClick={() => void onSave()}>
            {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : <IoSaveOutline className="size-4" />}
            {t("save", { count: writes })}
          </Button>
        </div>
      )}
    </div>
  );
}
