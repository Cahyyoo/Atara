"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/core/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/components/ui/select";
import type { Access, Department } from "@/core/lib/auth/permissions";
import { DEPARTMENT_LABEL_KEYS, personaLabelKeys } from "@/core/lib/auth/role-labels";
import type { UserRole } from "@/core/types";
import { assignableDepartments, assignableRoles } from "@/modules/system/lib/user-scope";

/**
 * The role an account is given, and the department when there is a choice.
 * Only what this manager may hand out (user-scope.ts) -- which is also all the
 * server accepts: the super admin makes department admins, the lab's admin
 * makes lab staff.
 */
export function UserAccessFields({
  manager,
  role,
  department,
  isSelf,
  onChange,
}: {
  manager: Access;
  role: UserRole;
  department: Department | null;
  isSelf: boolean;
  onChange: (role: UserRole, department: Department | null) => void;
}) {
  const t = useTranslations("users.dialog");
  const tUsers = useTranslations("users");
  const roles = assignableRoles(manager);
  const departments = assignableDepartments(manager, role);

  return (
    <>
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="user-role">{tUsers("role")}</Label>
      <Select
        value={role}
        items={Object.fromEntries(
          roles.map((value) => [value, t(personaLabelKeys({ role: value, department }).name)])
        )}
        onValueChange={(value) => {
          const next = value as UserRole;
          // Keep the department when the new role may have it.
          const allowed = assignableDepartments(manager, next);
          onChange(next, department && allowed.includes(department) ? department : (allowed[0] ?? null));
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
          onValueChange={(value) => onChange(role, value as Department)}
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
    </>
  );
}
