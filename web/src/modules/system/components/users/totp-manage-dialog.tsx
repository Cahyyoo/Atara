"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
import type { UserDTO } from "@/modules/system/types";
import { IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/core/lib/http/base-path";

type Action = "require" | "cancelRequest" | "reset" | "disable";

/**
 * An account's authenticator app, from the admin's side.
 *
 * The admin decides whether one is required and can take it away; the admin
 * never sees the secret. Setting it up happens on the person's own phone at
 * their next sign-in, so what is managed here is a state, not a credential:
 *
 *   off      -> require        (they set it up next time they sign in)
 *   pending  -> cancel request
 *   active   -> reset          (lost or replaced phone: set up again)
 *            -> turn off
 *
 * Reset and turn off ask twice. Both take a factor away from somebody, and
 * one of them locks their current phone out on the spot.
 */
export function TotpManageDialog({
  target,
  onClose,
  onChanged,
}: {
  target: UserDTO | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("mfa.admin");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState<"reset" | "disable" | null>(null);

  function close() {
    if (busy) return;
    setError(null);
    setConfirming(null);
    onClose();
  }

  async function run(action: Action) {
    if (!target) return;
    setError(null);
    setBusy(action);

    try {
      const method = action === "require" || action === "reset" ? "POST" : "DELETE";
      const response = await fetch(withBasePath(`/api/users/${target.id}/totp`), { method });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error ?? tCommon("networkError"));
        return;
      }

      const name = target.name;
      toast(
        action === "require"
          ? t("requested", { name })
          : action === "reset"
            ? t("resetDone", { name })
            : t("disabled", { name })
      );
      onChanged();
      setConfirming(null);
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(null);
    }
  }

  const spinner = (action: Action) =>
    busy === action ? <IoReloadOutline className="size-4 animate-spin" /> : null;

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {target ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
              <DialogDescription>
                {target.totpEnabledAt
                  ? t("statusActive", {
                      date: format.dateTime(new Date(target.totpEnabledAt), { dateStyle: "medium" }),
                    })
                  : target.totpRequestedAt
                    ? t("statusPending", {
                        name: target.name,
                        date: format.dateTime(new Date(target.totpRequestedAt), { dateStyle: "medium" }),
                      })
                    : t("statusOff", { name: target.name })}
              </DialogDescription>
            </DialogHeader>

            {!target.totpEnabledAt && !target.totpRequestedAt ? (
              <p className="text-sm text-muted-foreground">{t("requireHint", { name: target.name })}</p>
            ) : null}

            {confirming ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {confirming === "reset"
                  ? t("resetHint", { name: target.name })
                  : t("disableHint", { name: target.name })}
              </p>
            ) : null}

            <InlineNotice tone="error">{error}</InlineNotice>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={busy !== null} onClick={close}>
                {tCommon("cancel")}
              </Button>

              {confirming ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  disabled={busy !== null}
                  onClick={() => run(confirming)}
                >
                  {spinner(confirming)}
                  {t("confirm")}
                </Button>
              ) : target.totpEnabledAt ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={busy !== null}
                    onClick={() => setConfirming("disable")}
                  >
                    {t("disable")}
                  </Button>
                  <Button type="button" disabled={busy !== null} onClick={() => setConfirming("reset")}>
                    {t("reset")}
                  </Button>
                </>
              ) : target.totpRequestedAt ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  disabled={busy !== null}
                  onClick={() => run("cancelRequest")}
                >
                  {spinner("cancelRequest")}
                  {t("cancelRequest")}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="gap-2"
                  disabled={busy !== null}
                  onClick={() => run("require")}
                >
                  {spinner("require")}
                  {t("require")}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
