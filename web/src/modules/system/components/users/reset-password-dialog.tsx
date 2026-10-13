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
import { personaLabelKeys } from "@/core/lib/auth/role-labels";
import type { ApiResult } from "@/core/types";
import type { UserDTO } from "@/modules/system/types";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

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
      const response = await fetch(withBasePath(`/api/users/${target.id}/reset-password`), { method: "POST" });
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
                  role: tDialog(personaLabelKeys(target).name),
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
