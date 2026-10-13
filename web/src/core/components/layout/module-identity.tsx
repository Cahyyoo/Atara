"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/core/lib/utils";
import { APP_NAME } from "@/core/lib/app/brand";
import type { AppModule } from "@/core/lib/app/module-types";

/**
 * Which module is open: its icon, its name and the app's name beneath. In the
 * sidebar's switcher and, below lg, in the header. `iconOnly` is the narrow
 * sidebar, where the name moves to the trigger's label.
 */
export function ModuleIdentity({ module: appModule, iconOnly = false }: { module: AppModule; iconOnly?: boolean }) {
  const t = useTranslations("nav");
  const Icon = appModule.icon;

  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", iconOnly && "justify-center")}>
      <span className="surface-hero flex size-9 shrink-0 items-center justify-center rounded-xl text-white">
        <Icon aria-hidden className="size-4" />
      </span>
      {iconOnly ? null : (
        <span className="min-w-0 text-left leading-tight">
          <span className="block truncate text-sm font-semibold">{t(`groups.${appModule.key}`)}</span>
          <span className="block text-xs text-muted-foreground">{APP_NAME}</span>
        </span>
      )}
    </span>
  );
}
