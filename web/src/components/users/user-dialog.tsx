"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isLockedOut } from "@/components/users/users-table";
import type { ApiResult, UserDTO, UserRole } from "@/types";
import type { Access, Department } from "@/lib/permissions";
import { DEPARTMENT_LABEL_KEYS, personaLabelKeys } from "@/lib/role-labels";
import { assignableDepartments, assignableRoles } from "@/lib/user-scope";
import type { RolePasswordStatus } from "@/lib/role-password-status";
import { IoKeyOutline, IoLockOpenOutline, IoReloadOutline, IoWarningOutline } from "react-icons/io5";
import { InlineNotice } from "@/components/ui/inline-notice";
import { withBasePath } from "@/lib/base-path";

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
    user?.role ?? (roles.includes("OPERATOR") ? "OPERATOR" : roles[0] ?? "OPERATOR")
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
    fetch(withBasePath("/api/admin/role-passwords"))
      .then((response) => response.json() as Promise<ApiResult<RolePasswordStatus[]>>)
      .then((result) => {
        if (!cancelled && result.success) setDefaults(result.data);
      })
      .catch(() => {
        // The server refuses the save with the same reason anyway.
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
    try {
      const response = await fetch(withBasePath(`/api/users/${user!.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlock: true }),
      });
      const result: ApiResult<UserDTO> = await response.json();

      if (!result.success) {
        setError(result.error);
        return;
      }
      setIsLocked(false);
      onSaved(result.data, false);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(withBasePath(isNew ? "/api/users" : `/api/users/${user!.id}`), {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew
            ? { name, email, role, department }
            : { name, role, department, isActive }
        ),
      });
      const result: ApiResult<UserDTO> = await response.json();

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSaved(result.data, isNew);
      onClose();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsSubmitting(false);
    }
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-role">{tUsers("role")}</Label>
          <Select
            value={role}
            items={Object.fromEntries(
              roles.map((value) => [value, t(personaLabelKeys({ role: value, department }).name)])
            )}
            onValueChange={(value) => {
              const next = value as UserRole;
              setRole(next);
              // Keep the department when the new role may have it.
              const allowed = assignableDepartments(manager, next);
              if (!department || !allowed.includes(department)) setDepartment(allowed[0] ?? null);
            }}
            disabled={isSelf}
          >
            <SelectTrigger id="user-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(personaLabelKeys({ role: value, department }).name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* What the chosen role will see, said before it is saved rather than
              discovered by the person it was given to. */}
          <p className="text-xs text-muted-foreground">
            {isSelf ? t("selfNote") : t(personaLabelKeys({ role, department }).hint)}
          </p>
        </div>

        {/* Only asked when there is a choice: the super admin puts an admin
            in a department; a department's admin only has its own. */}
        {departments.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-department">{tUsers("department")}</Label>
            <Select
              value={department ?? ""}
              items={Object.fromEntries(
                departments.map((value) => [value, t(DEPARTMENT_LABEL_KEYS[value])])
              )}
              onValueChange={(value) => setDepartment(value as Department)}
              disabled={isSelf}
            >
              <SelectTrigger id="user-department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departments.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(DEPARTMENT_LABEL_KEYS[value])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {/* No password to type: the account starts on the role's default
            and its owner replaces it on their first sign-in. */}
        {isNew ? (
          missingDefault ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <IoWarningOutline className="mt-0.5 size-4 shrink-0" />
              <p>
                {t("noRoleDefault", { role: t(personaLabelKeys({ role, department }).name) })}{" "}
                {/* The defaults are on this same page, under the table. */}
                <a
                  href="#role-passwords"
                  onClick={onClose}
                  className="font-medium underline underline-offset-2"
                >
                  {t("noRoleDefaultLink")}
                </a>
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <IoKeyOutline className="mt-0.5 size-4 shrink-0" />
              <p>{t("defaultPasswordNote", { role: t(personaLabelKeys({ role, department }).name) })}</p>
            </div>
          )
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
