"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { isLockedOut } from "@/modules/system/components/users/user-status";
import type { UserRole } from "@/core/types";
import type { UserDTO } from "@/modules/system/types";
import type { Access, Department } from "@/core/lib/auth/permissions";
import { assignableDepartments, assignableRoles } from "@/modules/system/lib/user-scope";
import type { RolePasswordStatus } from "@/modules/system/lib/role-password-status";
import { IoLockOpenOutline, IoReloadOutline } from "react-icons/io5";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { apiFetch, jsonBody } from "@/core/lib/http/api-client";
import { UserAccessFields } from "@/modules/system/components/users/user-access-fields";
import { DefaultPasswordNote } from "@/modules/system/components/users/default-password-note";

/** `null` closes the dialog; "new" opens it in create mode. */
export type UserDialogTarget = UserDTO | "new" | null;

interface UserDialogProps {
  target: UserDialogTarget;
  /** The signed-in admin, who may not demote or deactivate themselves. */
  currentUserId: string;
  /** The signed-in admin's role and department: what they may hand out. */
  manager: Access;
  onClose: () => void;
  onSaved: (user: UserDTO, isNew: boolean) => void;
}

export function UserDialog({ target, currentUserId, manager, onClose, onSaved }: UserDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {target ? (
          // Keyed so switching rows resets the form to that user's values.
          <UserForm
            key={target === "new" ? "new" : target.id}
            target={target}
            currentUserId={currentUserId}
            manager={manager}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface UserFormProps {
  target: UserDTO | "new";
  currentUserId: string;
  manager: Access;
  onClose: () => void;
  onSaved: (user: UserDTO, isNew: boolean) => void;
}

function UserForm({ target, currentUserId, manager, onClose, onSaved }: UserFormProps) {
  const t = useTranslations("users.dialog");
  const tUsers = useTranslations("users");
  const tCommon = useTranslations("common");
  const isNew = target === "new";
  const user = isNew ? null : target;
  const isSelf = user?.id === currentUserId;

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  // Only what this manager may hand out (user-scope.ts), which is also all
  // the server accepts: the super admin makes department admins, the lab's
  // admin makes lab staff.
  const roles = assignableRoles(manager);
  // Most new lab accounts are operators, so that is where the picker starts.
  const [role, setRole] = useState<UserRole>(
    user?.role ?? (roles.includes("PREPARATOR") ? "PREPARATOR" : roles[0] ?? "PREPARATOR")
  );
  const departments = assignableDepartments(manager, role);
  const [department, setDepartment] = useState<Department | null>(
    user?.department ?? departments[0] ?? null
  );
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(user !== null && isLockedOut(user));
  // Which roles have a default password: a new account starts on it, so a
  // role without one cannot be given an account yet.
  const [defaults, setDefaults] = useState<RolePasswordStatus[] | null>(null);

  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    // On failure the server refuses the save with the same reason anyway.
    void apiFetch<RolePasswordStatus[]>("/api/admin/role-passwords").then((outcome) => {
      if (!cancelled && outcome.ok) setDefaults(outcome.data);
    });
    return () => {
      cancelled = true;
    };
  }, [isNew]);

  const missingDefault =
    isNew && defaults !== null && !defaults.some((entry) => entry.role === role && entry.isSet);

  async function handleUnlock() {
    setError(null);
    setIsSubmitting(true);
    const outcome = await apiFetch<UserDTO>(`/api/users/${user!.id}`, {
      ...jsonBody("PATCH", { unlock: true }),
      networkError: tCommon("networkError"),
    });
    setIsSubmitting(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setIsLocked(false);
    onSaved(outcome.data, false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const outcome = await apiFetch<UserDTO>(isNew ? "/api/users" : `/api/users/${user!.id}`, {
      ...jsonBody(isNew ? "POST" : "PATCH", isNew ? { name, email, role, department } : { name, role, department, isActive }),
      networkError: tCommon("networkError"),
    });
    setIsSubmitting(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    onSaved(outcome.data, isNew);
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? t("addTitle") : t("editTitle")}</DialogTitle>
        <DialogDescription>
          {isNew ? t("addDescription") : user!.email}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-name">{tCommon("name")}</Label>
          <Input
            id="user-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        {isNew ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">{tUsers("email")}</Label>
            <Input
              id="user-email"
              type="email"
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        ) : null}

        <UserAccessFields
          manager={manager}
          role={role}
          department={department}
          isSelf={isSelf}
          onChange={(nextRole, nextDepartment) => {
            setRole(nextRole);
            setDepartment(nextDepartment);
          }}
        />

        {isNew ? (
          <DefaultPasswordNote
            role={role}
            department={department}
            missingDefault={missingDefault}
            onGoToDefaults={onClose}
          />
        ) : null}

        {isLocked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <p className="text-sm text-destructive">{t("lockedNotice")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isSubmitting}
              onClick={handleUnlock}
            >
              <IoLockOpenOutline className="size-3.5" />
              {t("unlock")}
            </Button>
          </div>
        ) : null}

        {!isNew ? (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={isActive}
              disabled={isSelf}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            <span className="flex flex-col">
              <span className="font-medium">{t("activeLabel")}</span>
              <span className="text-xs text-muted-foreground">{t("activeDescription")}</span>
            </span>
          </label>
        ) : null}

        <InlineNotice tone="error">{error}</InlineNotice>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" className="gap-2" disabled={isSubmitting || missingDefault}>
            {isSubmitting ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {isNew ? t("create") : t("save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
