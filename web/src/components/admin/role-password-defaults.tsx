"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { Role } from "@/lib/permissions";
import type { RolePasswordStatus } from "@/lib/role-password-status";
import type { ApiResult } from "@/types";
import { IoEyeOffOutline, IoEyeOutline, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

/**
 * The password each role's new accounts start on, and that a forgotten one is
 * reset to. Write-only: once saved it is a hash, so this only ever says
 * whether a role has one, and since when.
 */
export function RolePasswordDefaults() {
  const t = useTranslations("admin.rolePasswords");
  const tRoles = useTranslations("users.dialog");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [statuses, setStatuses] = useState<RolePasswordStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Role | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(withBasePath("/api/admin/role-passwords"), { signal: controller.signal });
        const body: ApiResult<RolePasswordStatus[]> = await response.json();
        if (body.success) setStatuses(body.data);
        else setError(body.error);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(tCommon("loadError"));
      }
    })();
    return () => controller.abort();
  }, [tCommon]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InlineNotice tone="error">{error}</InlineNotice>
        {statuses === null && !error ? (
          <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
        ) : null}
        {statuses ? (
          <ul className="divide-y rounded-lg border">
            {statuses.map((status) => (
              <li
                key={status.role}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {tRoles(ROLE_LABEL_KEYS[status.role].name)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {status.isSet && status.updatedAt
                      ? t("setAt", {
                          when: format.dateTime(new Date(status.updatedAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }),
                          by: status.updatedBy ?? "—",
                        })
                      : t("notSetHint")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={status.isSet ? "secondary" : "outline"}>
                    {status.isSet ? t("set") : t("notSet")}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t("editFor", { role: tRoles(ROLE_LABEL_KEYS[status.role].name) })}
                    onClick={() => setEditing(status.role)}
                  >
                    {status.isSet ? t("change") : t("setAction")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("note")}</p>
      </CardContent>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          {editing ? (
            <RolePasswordForm
              key={editing}
              role={editing}
              onClose={() => setEditing(null)}
              onSaved={(next) => {
                setStatuses(next);
                setError(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RolePasswordForm({
  role,
  onClose,
  onSaved,
}: {
  role: Role;
  onClose: () => void;
  onSaved: (statuses: RolePasswordStatus[]) => void;
}) {
  const t = useTranslations("admin.rolePasswords");
  const tRoles = useTranslations("users.dialog");
  const tCommon = useTranslations("common");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const roleName = tRoles(ROLE_LABEL_KEYS[role].name);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError(t("tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(withBasePath("/api/admin/role-passwords"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, password }),
      });
      const body: ApiResult<RolePasswordStatus[]> = await response.json();
      if (!body.success) {
        setError(body.error);
        return;
      }
      toast(t("saved", { role: roleName }));
      onSaved(body.data);
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("dialogTitle", { role: roleName })}</DialogTitle>
        <DialogDescription>{t("dialogDescription")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role-password-new">{t("password")}</Label>
        <div className="relative">
          <Input
            id="role-password-new"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            className="pr-9"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={visible ? t("hide") : t("show")}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? <IoEyeOffOutline className="size-4" /> : <IoEyeOutline className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role-password-confirm">{t("confirm")}</Label>
        <Input
          id="role-password-confirm"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" className="gap-2" disabled={saving}>
          {saving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
