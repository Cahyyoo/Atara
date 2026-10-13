"use client";

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
import { IoChevronBackOutline, IoChevronForwardOutline, IoPrismOutline } from "react-icons/io5";

/**
 * The app's name, back to the launcher. Heads the header on the launcher and
 * the guide, where there is no sidebar to carry it.
 */
export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("nav");

  return (
    <Link
      href={HOME_PATH}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
    >
      <div className="surface-hero flex size-9 shrink-0 items-center justify-center rounded-xl text-white">
        <IoPrismOutline className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">{APP_NAME}</p>
        <p className="text-xs text-muted-foreground">{t("brandSubtitle")}</p>
      </div>
    </Link>
  );
}

/**
 * The sidebar inside a module: the switcher to every app at the top, then the
 * module's own menu -- only its pages, and only those this person may open
 * (each page checks the same capability, requireCapabilityPage). Narrowed to
 * icons when `collapsed`, which leaves wide tables their room; the names stay
 * as accessible labels and tooltips.
 */
export function ModuleSidebar({
  module: appModule,
  user,
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  module: AppModule;
  user: SessionPayload;
  collapsed?: boolean;
  /** Absent in the phone drawer, which is always wide. */
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <>
      <div className={cn("pt-4", collapsed ? "px-2" : "px-3")}>
        <AppSwitcher current={appModule} user={user} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      {/* Scrolls on its own if the menu ever outgrows the viewport. */}
      <nav
        className={cn("flex flex-1 flex-col overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}
        data-tour="sidebar-nav"
      >
        <NavList items={navFor(user, appModule)} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>

      {onToggle ? (
        <div className={cn("pb-4", collapsed ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("expandMenu") : t("collapseMenu")}
            title={collapsed ? t("expandMenu") : undefined}
            className={cn(
              "flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <IoChevronForwardOutline aria-hidden className="size-4 shrink-0" />
            ) : (
              <>
                <IoChevronBackOutline aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{t("collapseMenu")}</span>
              </>
            )}
          </button>
        </div>
      ) : null}
    </>
  );
}

function NavList({
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  items: readonly { href: string; key: string; icon: IconType }[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const active = activeNavItem(pathname, items)?.href ?? null;

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = item.href === active;
        const Icon = item.icon;
        const label = t(item.key);

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                // min-h-11 clears a 44px touch target, the size iOS asks
                // for and the size a gloved thumb needs.
                "relative flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                collapsed && "justify-center px-0",
                isActive
                  ? "surface-hero text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
              {/* Inside the Link, which is how useLinkStatus scopes itself to
                  this navigation rather than to any. In the corner when the
                  sidebar is narrow, so the icon does not move. */}
              <span className={collapsed ? "absolute right-1 top-1 flex" : "ml-auto flex"}>
                <NavPending />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
