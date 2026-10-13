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
import { IoReloadOutline } from "react-icons/io5";
import type { Confirming } from "@/modules/lab/components/shared/lab-records-table/types";

/** Asks before samples are removed or restored, or sub-samples deleted. */
export function RemoveConfirmDialog({
  confirming,
  showDeleted,
  isRemoving,
  sampleCount,
  subCount,
  onCancel,
  onRemove,
  onRemoveSubs,
}: {
  confirming: Confirming;
  showDeleted: boolean;
  isRemoving: boolean;
  sampleCount: number;
  subCount: number;
  onCancel: () => void;
  onRemove: () => void;
  onRemoveSubs: () => void;
}) {
  const t = useTranslations("database");
  const tCommon = useTranslations("common");

  return (
    <Dialog open={confirming !== false} onOpenChange={(open) => (isRemoving || open ? null : onCancel())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {confirming === "subs"
              ? t("subs.removeConfirmTitle", { count: subCount })
              : showDeleted
                ? t("restoreConfirmTitle", { count: sampleCount })
                : t("removeConfirmTitle", { count: sampleCount })}
          </DialogTitle>
          <DialogDescription>
            {confirming === "subs"
              ? t("subs.removeConfirmBody")
              : showDeleted
                ? t("restoreConfirmBody")
                : t("removeConfirmBody")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={isRemoving} onClick={onCancel}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant={showDeleted && confirming !== "subs" ? "default" : "destructive"}
            className="gap-2"
            disabled={isRemoving}
            onClick={confirming === "subs" ? onRemoveSubs : onRemove}
          >
            {isRemoving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {confirming === "subs" ? t("subs.removeShort") : showDeleted ? t("restore") : t("remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
