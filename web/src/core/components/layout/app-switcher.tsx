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
 * Which module is open, and -- one click away, as in Linear, Slack or
 * Atlassian -- every other module this person may open, without going back to
 * the launcher first. The launcher itself is the last item.
 *
 * `bar` sits in the top bar beside the app's mark, so it is just the module's
 * tile and name; `menu` heads the phone drawer, with the app's name beneath.
 */
export function AppSwitcher({
  current,
  user,
  variant = "bar",
  onNavigate,
}: {
  current: AppModule;
  user: SessionPayload;
  variant?: "bar" | "menu";
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
        className={cn(
          "flex min-w-0 items-center gap-2 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted/70",
          variant === "bar" ? "rounded-lg px-1.5 py-1" : "w-full rounded-xl px-2 py-2"
        )}
      >
        {variant === "bar" ? (
          <>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <current.icon aria-hidden className="size-3.5" />
            </span>
            <span className="truncate text-sm font-semibold">{t(`groups.${current.key}`)}</span>
          </>
        ) : (
          <ModuleIdentity module={current} />
        )}
        <IoChevronDown aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground", variant === "menu" && "ml-auto")} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("apps")}</DropdownMenuLabel>
          {modulesFor(user).map((appModule) => {
            const Icon = appModule.icon;
            const isCurrent = appModule.key === current.key;
            return (
              <DropdownMenuItem key={appModule.key} onClick={() => go(moduleEntryPath(user, appModule))}>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
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
