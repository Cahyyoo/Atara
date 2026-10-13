"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { ASSAY_FIELDS } from "@/modules/lab/lib/records/assay";
import type { Replaced } from "@/modules/lab/components/assay/results-entry-utils";
import { IoReloadOutline } from "react-icons/io5";

interface ResultsOverwriteDialogProps {
  replacing: Replaced[] | null;
  isSaving: boolean;
  onDismiss: () => void;
  onKeepOld: () => void;
  onConfirm: () => void;
}

/** Replacing a result the lab already reported is done on purpose. */
export function ResultsOverwriteDialog({
  replacing,
  isSaving,
  onDismiss,
  onKeepOld,
  onConfirm,
}: ResultsOverwriteDialogProps) {
  const t = useTranslations("assay");
  const tDatabase = useTranslations("database");

  return (
    <Dialog open={replacing !== null} onOpenChange={(open) => (open || isSaving ? null : onDismiss())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("overwrite.title", {
              count: (replacing ?? []).reduce((total, entry) => total + entry.fields.length, 0),
            })}
          </DialogTitle>
          <DialogDescription>{t("overwrite.body")}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto font-mono text-xs">
          {(replacing ?? []).map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-x-3">
              <span className="font-semibold">{entry.label}</span>
              {entry.fields.map((field) => (
                <span key={field.field} className="whitespace-nowrap text-amber-700 dark:text-amber-400">
                  {ASSAY_FIELDS.find((spec) => spec.key === field.field)?.shortLabel ?? tDatabase(field.field)}{" "}
                  {String(field.from)} → {field.to === null ? "—" : String(field.to)}
                </span>
              ))}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" disabled={isSaving} onClick={onKeepOld}>
            {t("overwrite.keepOld")}
          </Button>
          <Button className="gap-2" disabled={isSaving} onClick={onConfirm}>
            {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {t("overwrite.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
