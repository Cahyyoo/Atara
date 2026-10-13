"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { IoReloadOutline, IoSaveOutline } from "react-icons/io5";

interface ResultsSaveBarProps {
  dirtyCount: number;
  invalidCount: number;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

/**
 * Pinned to the bottom of the window while there is something to save,
 * so Save is never a scroll away from the row just typed in.
 */
export function ResultsSaveBar({ dirtyCount, invalidCount, isSaving, onDiscard, onSave }: ResultsSaveBarProps) {
  const t = useTranslations("assay");

  return (
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-raised backdrop-blur-sm">
      <span className="text-sm font-medium">{t("dirtyRows", { count: dirtyCount })}</span>
      {invalidCount > 0 ? (
        <span className="text-sm text-destructive">{t("invalidCells", { count: invalidCount })}</span>
      ) : (
        <span className="hidden text-xs text-muted-foreground sm:inline">{t("saveHint")}</span>
      )}
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" disabled={isSaving} onClick={onDiscard}>
          {t("discard")}
        </Button>
        <Button className="gap-2" disabled={isSaving} onClick={onSave}>
          {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : <IoSaveOutline className="size-4" />}
          {t("saveRows", { count: dirtyCount })}
        </Button>
      </div>
    </div>
  );
}
