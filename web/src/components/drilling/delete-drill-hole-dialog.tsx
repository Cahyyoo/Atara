"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import { withBasePath } from "@/lib/base-path";
import type { ApiResult, DrillHoleDTO } from "@/types";
import { IoReloadOutline } from "react-icons/io5";

/** Removing a drill hole is permanent, so it is asked once more by name. */
export function DeleteDrillHoleDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DrillHoleDTO | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("drilling.delete");
  const tCommon = useTranslations("common");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!target) return;
    setError(null);
    setIsDeleting(true);
    try {
      const response = await fetch(withBasePath(`/api/drill-holes/${target.id}`), { method: "DELETE" });
      const result: ApiResult<{ id: string }> = await response.json();
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast(t("done", { holeId: target.holeId }));
      onDeleted(target.id);
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>{t("confirm", { holeId: target.holeId })}</DialogDescription>
            </DialogHeader>

            <InlineNotice tone="error">{error}</InlineNotice>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={isDeleting} onClick={onClose}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" variant="destructive" className="gap-2" disabled={isDeleting} onClick={handleDelete}>
                {isDeleting ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {t("action")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
