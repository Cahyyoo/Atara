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

interface ResultsUnsavedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirtyCount: number;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}

/** Going back to the list with edits on screen stops and asks. */
export function ResultsUnsavedDialog({
  open,
  onOpenChange,
  dirtyCount,
  isSaving,
  onDiscard,
  onSave,
}: ResultsUnsavedDialogProps) {
  const t = useTranslations("assay");
  const tCommon = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("unsaved.title", { count: dirtyCount })}</DialogTitle>
          <DialogDescription>{t("unsaved.body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={onDiscard}
          >
            {t("unsaved.discard")}
          </Button>
          <Button disabled={isSaving} onClick={onSave}>
            {t("unsaved.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
