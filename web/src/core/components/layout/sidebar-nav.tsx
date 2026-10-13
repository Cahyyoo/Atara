"use client";

import { useEffect } from "react";
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

/** Typing goes to the field: a shortcut must not steal Ctrl+B from a text box. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The sidebar inside a module: the switcher to every app at the top, then the
 * module's own menu -- only its pages, and only those this person may open
 * (each page checks the same capability, requireCapabilityPage). Narrowed to
 * icons when `collapsed` (the button at the foot, or Ctrl/Cmd+B), which leaves
 * wide tables their room; the names stay as accessible labels and tooltips.
 *
 * Quiet on purpose, as in Linear or Vercel: hairlines rather than blocks, and
 * the open page a soft tint with a short bar beside it, so the eye goes to the
 * page and not to the menu.
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
  /** Absent in the phone drawer, which is always wide and has no shortcut. */
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  useEffect(() => {
    if (!onToggle) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggle]);

  return (
    <>
      <div className={cn("border-b border-border/60 py-3", collapsed ? "px-2" : "px-2.5")}>
        <AppSwitcher current={appModule} user={user} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      {/* Scrolls on its own if the menu ever outgrows the viewport. */}
      <nav
        className={cn("flex flex-1 flex-col gap-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-2.5")}
        data-tour="sidebar-nav"
      >
        {collapsed ? null : (
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {t("menu")}
          </p>
        )}
        <NavList items={navFor(user, appModule)} pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>

      {onToggle ? (
        <div className={cn("border-t border-border/60 py-2.5", collapsed ? "px-2" : "px-2.5")}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("expandMenu") : t("collapseMenu")}
            title={`${collapsed ? t("expandMenu") : t("collapseMenu")} (${t("collapseShortcut")})`}
            className={cn(
              "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              collapsed && "mx-auto size-10 justify-center px-0"
            )}
          >
            {collapsed ? (
              <IoChevronForwardOutline aria-hidden className="size-4 shrink-0" />
            ) : (
              <>
                <IoChevronBackOutline aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{t("collapseMenu")}</span>
                <kbd className="ml-auto rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
                  {t("collapseShortcut")}
                </kbd>
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
    <ul className="flex flex-col gap-0.5">
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
                // min-h-11 on a phone clears a 44px touch target, the size
                // iOS asks for and the size a gloved thumb needs; a mouse on
                // a desktop gets the tighter row.
                "relative flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-9",
                collapsed && "mx-auto size-10 min-h-0 justify-center px-0 lg:min-h-0",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                // A short bar beside the open page, as Linear and Vercel mark it.
                isActive &&
                  !collapsed &&
                  "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className={collapsed ? "sr-only" : "truncate"}>{label}</span>
              {/* Inside the Link, which is how useLinkStatus scopes itself to
                  this navigation rather than to any. In the corner when the
                  sidebar is narrow, so the icon does not move. */}
              <span className={collapsed ? "absolute right-0.5 top-0.5 flex" : "ml-auto flex"}>
                <NavPending />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
