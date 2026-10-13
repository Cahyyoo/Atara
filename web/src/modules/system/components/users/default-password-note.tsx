"use client";

import { useTranslations } from "next-intl";
import type { Department } from "@/core/lib/auth/permissions";
import { personaLabelKeys } from "@/core/lib/auth/role-labels";
import type { UserRole } from "@/core/types";
import { IoKeyOutline, IoWarningOutline } from "react-icons/io5";

/**
 * No password to type: a new account starts on its role's default and its
 * owner replaces it on their first sign-in. Says which -- or that the role
 * has none yet, with the way to set it.
 */
export function DefaultPasswordNote({
  role,
  department,
  missingDefault,
  onGoToDefaults,
}: {
  role: UserRole;
  department: Department | null;
  missingDefault: boolean;
  onGoToDefaults: () => void;
}) {
  const t = useTranslations("users.dialog");
  return (
    missingDefault ? (
      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
        <IoWarningOutline className="mt-0.5 size-4 shrink-0" />
        <p>
          {t("noRoleDefault", { role: t(personaLabelKeys({ role, department }).name) })}{" "}
          {/* The defaults are on this same page, under the table. */}
          <a
            href="#role-passwords"
            onClick={onGoToDefaults}
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
  );
}
