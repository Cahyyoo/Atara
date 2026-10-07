"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ROLE_DEFAULT_PASSWORD_CODE, WRONG_PASSWORD_CODE } from "@/lib/session-codes";
import type { ApiResult } from "@/types";
import { IoReloadOutline } from "react-icons/io5";

const MIN_LENGTH = 8;

/**
 * Changing one's own password, from the user menu.
 *
 * The rules are checked here only to save a round trip; the server checks
 * them again. Every other device the account is signed in on is signed out,
 * which the dialog says before and the toast confirms after.
 */
export function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("account.password");
  const tCommon = useTranslations("common");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (next.length < MIN_LENGTH) return setError(t("tooShort", { min: MIN_LENGTH }));
    if (next !== confirm) return setError(t("mismatch"));
    if (next === current) return setError(t("sameAsCurrent"));

    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const result: ApiResult<{ endedSessions: number }> = await response.json();

      if (!result.success) {
        setError(
          result.code === WRONG_PASSWORD_CODE
            ? t("wrongCurrent")
            : result.code === ROLE_DEFAULT_PASSWORD_CODE
              ? t("roleDefault")
              : result.error || tCommon("networkError")
        );
        return;
      }

      toast(
        result.data.endedSessions > 0
          ? t("doneWithSignOut", { count: result.data.endedSessions })
          : t("done")
      );
      setBusy(false);
      close();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">{t("current")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("new")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              minLength={MIN_LENGTH}
              maxLength={128}
              required
            />
            <p className="text-xs text-muted-foreground">{t("hint", { min: MIN_LENGTH })}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">{t("confirm")}</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </div>

          <InlineNotice tone="error">{error}</InlineNotice>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" className="gap-2" disabled={busy}>
              {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
