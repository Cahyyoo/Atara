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
import { ROLE_LABEL_KEYS } from "@/lib/role-labels";
import type { ApiResult, UserDTO } from "@/types";
import { IoReloadOutline } from "react-icons/io5";

/**
 * A forgotten password: the account goes back to its role's default, every
 * device it is signed in on is signed out, and its owner replaces the default
 * on their next sign-in. Confirmed by name, since it signs somebody out.
 */
export function ResetPasswordDialog({
  target,
  onClose,
  onReset,
}: {
  target: UserDTO | null;
  onClose: () => void;
  onReset: (user: UserDTO) => void;
}) {
  const t = useTranslations("users.resetDefault");
  const tDialog = useTranslations("users.dialog");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  async function reset() {
    if (!target) return;
    setError(null);
    setIsResetting(true);

    try {
      const response = await fetch(`/api/users/${target.id}/reset-password`, { method: "POST" });
      const result: ApiResult<UserDTO> = await response.json();

      if (!result.success) {
        setError(result.error);
        return;
      }

      toast(t("done", { name: target.name }));
      onReset(result.data);
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !isResetting) {
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
              <DialogDescription>
                {t("confirm", {
                  name: target.name,
                  role: tDialog(ROLE_LABEL_KEYS[target.role].name),
                })}
              </DialogDescription>
            </DialogHeader>

            <InlineNotice tone="error">{error}</InlineNotice>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={isResetting} onClick={onClose}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                disabled={isResetting}
                onClick={reset}
              >
                {isResetting ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {t("action")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
