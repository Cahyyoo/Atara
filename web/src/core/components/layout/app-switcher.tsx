"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/core/components/ui/dropdown-menu";
import { ModuleIdentity } from "@/core/components/layout/module-identity";
import type { AppModule } from "@/core/lib/app/module-types";
import type { SessionPayload } from "@/core/lib/auth/auth";
import { HOME_PATH, moduleEntryPath, modulesFor } from "@/core/lib/app/modules";
import { cn } from "@/core/lib/utils";
import { IoCheckmark, IoChevronDown, IoGridOutline } from "react-icons/io5";

/**
 * The head of the module sidebar: which module is open, and -- one click away,
 * as in Linear, Slack or Atlassian -- every other module this person may
 * open, without going back to the launcher first. The launcher itself is the
 * last item.
 */
export function AppSwitcher({
  current,
  user,
  collapsed = false,
  onNavigate,
}: {
  current: AppModule;
  user: SessionPayload;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const go = (href: string) => {
    onNavigate?.();
    router.push(href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tour="app-switcher"
        aria-label={t("switchApp")}
        title={collapsed ? t(`groups.${current.key}`) : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted",
          collapsed && "justify-center"
        )}
      >
        <ModuleIdentity module={current} iconOnly={collapsed} />
        {collapsed ? null : <IoChevronDown aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("apps")}</DropdownMenuLabel>
          {modulesFor(user).map((appModule) => {
            const Icon = appModule.icon;
            const isCurrent = appModule.key === current.key;
            return (
              <DropdownMenuItem key={appModule.key} onClick={() => go(moduleEntryPath(user, appModule))}>
                <span className="surface-hero flex size-6 shrink-0 items-center justify-center rounded-md text-white">
                  <Icon aria-hidden className="size-3.5" />
                </span>
                <span className="truncate">{t(`groups.${appModule.key}`)}</span>
                {isCurrent ? <IoCheckmark aria-label={t("currentApp")} className="ml-auto size-4 text-primary" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go(HOME_PATH)}>
          <IoGridOutline aria-hidden className="size-4" />
          {t("allApps")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
