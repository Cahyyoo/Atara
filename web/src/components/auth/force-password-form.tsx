"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineNotice } from "@/components/ui/inline-notice";
import { ROLE_DEFAULT_PASSWORD_CODE, WRONG_PASSWORD_CODE } from "@/lib/session-codes";
import { safeRedirectPath } from "@/lib/safe-redirect";
import type { ApiResult } from "@/types";
import { IoReloadOutline } from "react-icons/io5";

const MIN_LENGTH = 8;

/**
 * Replacing the password an administrator chose, before anything else.
 *
 * The same rules and the same route as changing it from the user menu --
 * the current password included, so a session left open somewhere cannot be
 * used to take the account over -- but there is no way round it: no cancel,
 * only signing out.
 */
export function ForcePasswordForm({ next }: { next: string | null }) {
  const t = useTranslations("account.password");
  const tForce = useTranslations("account.forceChange");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) return setError(t("tooShort", { min: MIN_LENGTH }));
    if (password !== confirm) return setError(t("mismatch"));
    if (password === current) return setError(t("sameAsCurrent"));

    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
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
        setBusy(false);
        return;
      }
      router.replace(safeRedirectPath(next));
      router.refresh();
    } catch {
      setError(tCommon("networkError"));
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{tForce("title")}</h2>
        <p className="text-sm text-muted-foreground">{tForce("description")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="force-current-password">{t("current")}</Label>
        <Input
          id="force-current-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="force-new-password">{t("new")}</Label>
        <Input
          id="force-new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={MIN_LENGTH}
          maxLength={128}
          required
        />
        <p className="text-xs text-muted-foreground">{t("hint", { min: MIN_LENGTH })}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="force-confirm-password">{t("confirm")}</Label>
        <Input
          id="force-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <Button type="submit" className="gap-2" disabled={busy}>
        {busy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
        {tForce("submit")}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void signOut()}>
        {tForce("signOut")}
      </Button>
    </form>
  );
}
