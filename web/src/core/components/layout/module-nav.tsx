"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { IconType } from "react-icons";
import { cn } from "@/core/lib/utils";
import { NavPending } from "@/core/components/layout/nav-pending";
import { AppSwitcher } from "@/core/components/layout/app-switcher";
import { APP_NAME } from "@/core/lib/app/brand";
import type { AppModule } from "@/core/lib/app/module-types";
import type { SessionPayload } from "@/core/lib/auth/auth";
import { HOME_PATH, activeNavItem, navFor } from "@/core/lib/app/modules";
import { BrandMark } from "@/core/components/layout/brand-mark";

/**
 * The app's mark, back to the launcher. With its name on the launcher and the
 * guide; `compact` inside a module, where the module's own name follows it.
 */
export function Brand({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");

  return (
    <Link
      href={HOME_PATH}
      onClick={onNavigate}
      aria-label={compact ? t("allApps") : undefined}
      title={compact ? t("allApps") : undefined}
      className="flex shrink-0 items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-muted"
    >
      <span className="surface-hero flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
        <BrandMark className="size-5" />
      </span>
      {compact ? null : (
        <span className="pr-1 leading-tight">
          <span className="block text-sm font-semibold">{APP_NAME}</span>
          <span className="block text-xs text-muted-foreground">{t("brandSubtitle")}</span>
        </span>
      )}
    </Link>
  );
}

/**
 * The module's menu as tabs under the top bar, from lg up -- every page in
 * sight at once, the open one underlined (as Vercel and GitHub do it), and the
 * whole width left to the page below. Only the module's own pages, and only
 * those this person may open (each checks the same capability,
 * requireCapabilityPage). Too many for the window, and the row scrolls
 * sideways, its edges fading to say so.
 */
export function ModuleTabs({ module: appModule, user }: { module: AppModule; user: SessionPayload }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const items = navFor(user, appModule);
  const active = activeNavItem(pathname, items)?.href ?? null;
  const activeRef = useRef<HTMLAnchorElement>(null);

  // A tab past the edge comes into view when its page opens.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav aria-label={t("menu")} data-tour="module-nav" className="-mb-px min-w-0">
      <ul className="flex overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = item.href === active;
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                ref={isActive ? activeRef : undefined}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-2 px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
                  isActive
                    ? "font-medium text-foreground after:bg-primary"
                    : "text-muted-foreground after:bg-transparent hover:text-foreground hover:after:bg-border"
                )}
              >
                <Icon aria-hidden className={cn("size-4 shrink-0", isActive && "text-primary")} />
                {t(item.key)}
                {/* Inside the Link, which is how useLinkStatus scopes itself
                    to this navigation rather than to any. */}
                <NavPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The same menu in the phone drawer, below lg: the switcher at the top, then
 * the pages as a list with a 44px row each -- the size iOS asks for and the
 * size a gloved thumb needs.
 */
export function ModuleMenu({
  module: appModule,
  user,
  onNavigate,
}: {
  module: AppModule;
  user: SessionPayload;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");

  return (
    <>
      <div className="border-b border-border/60 px-2.5 py-3">
        <AppSwitcher current={appModule} user={user} variant="menu" onNavigate={onNavigate} />
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3">
        <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {t("menu")}
        </p>
        <MenuList items={navFor(user, appModule)} onNavigate={onNavigate} />
      </nav>
    </>
  );
}

function MenuList({
  items,
  onNavigate,
}: {
  items: readonly { href: string; key: string; icon: IconType }[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const active = activeNavItem(pathname, items)?.href ?? null;

  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const isActive = item.href === active;
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive
                  ? "bg-primary/10 font-medium text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{t(item.key)}</span>
              <span className="ml-auto flex">
                <NavPending />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
