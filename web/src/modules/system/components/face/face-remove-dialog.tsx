"use client";

import { useState } from "react";
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
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { toast } from "@/core/components/ui/toast";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

/**
 * Removing somebody's face data.
 *
 * Two jobs at once, and both matter. It is the erasure route for specific
 * personal data, which UU PDP No. 27/2022 requires be possible. And it is the
 * way back in for a preparator the camera will not recognise — behind a dust
 * mask, behind safety glasses, under a bad light over the bench.
 *
 * Confirmed by name rather than by a bare "are you sure": the rows are gone
 * for good afterwards, and the account it belongs to is the one thing worth
 * checking before that happens.
 */
export function FaceRemoveDialog({
  target,
  onClose,
  onRemoved,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const t = useTranslations("face");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  async function remove() {
    if (!target) return;
    setError(null);
    setIsRemoving(true);

    try {
      const response = await fetch(withBasePath(`/api/users/${target.id}/face`), { method: "DELETE" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error ?? tCommon("networkError"));
        return;
      }

      toast(t("removed", { name: target.name }));
      onRemoved();
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !isRemoving) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("removeFace")}</DialogTitle>
              <DialogDescription>{t("removeConfirm", { name: target.name })}</DialogDescription>
            </DialogHeader>

            <InlineNotice tone="error">{error}</InlineNotice>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={isRemoving} onClick={onClose}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                disabled={isRemoving}
                onClick={remove}
              >
                {isRemoving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {t("removeFace")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
