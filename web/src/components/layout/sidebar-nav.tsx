"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { IconType } from "react-icons";
import { cn } from "@/lib/utils";
import { NavPending } from "@/components/layout/nav-pending";
import { APP_NAME } from "@/lib/brand";
import type { SessionPayload } from "@/lib/auth";
import { can, type Capability } from "@/lib/permissions";
import { canAccessModule, HOME_PATH, type ModuleKey } from "@/lib/modules";
import {
  IoAppsOutline,
  IoCompassOutline,
  IoTimeOutline,
  IoCreateOutline,
  IoHelpCircleOutline,
  IoHomeOutline,
  IoFingerPrintOutline,
  IoSettingsOutline,
  IoListOutline,
  IoPeopleOutline,
  IoPrintOutline,
  IoQrCodeOutline,
  IoServerOutline,
  IoShieldCheckmarkOutline,
  IoStatsChartOutline,
  IoPrismOutline,
} from "react-icons/io5";

/**
 * The menu, grouped by module. A group shows only to the people who work in
 * that module (modules.ts); each item names the capability its page is
 * guarded by, so the menu can only offer what the page will then let somebody
 * open. The pages check the same capability on the server
 * (requireCapabilityPage).
 *
 * Users sits in both the lab and the system group: the same page, scoped to
 * whoever opens it (user-scope.ts). Nobody works in both modules, so nobody
 * sees it twice.
 */
const NAV_GROUPS = [
  {
    module: "lab",
    items: [
      { href: "/lab/dashboard", key: "dashboard", icon: IoAppsOutline, capability: "viewDashboard" },
      { href: "/lab/samples/generate", key: "generateSamples", icon: IoQrCodeOutline, capability: "generateSamples" },
      { href: "/lab/samples/labels", key: "reprintLabels", icon: IoPrintOutline, capability: "printLabels" },
      { href: "/lab/database", key: "sampleDatabase", icon: IoServerOutline, capability: "viewDatabase" },
      { href: "/lab/data-quality", key: "dataQuality", icon: IoShieldCheckmarkOutline, capability: "viewDatabase" },
      { href: "/lab/assay", key: "assayEntry", icon: IoCreateOutline, capability: "enterResults" },
      { href: "/lab/grade", key: "gradeControl", icon: IoStatsChartOutline, capability: "readLabRecords" },
      { href: "/lab/master-data", key: "masterData", icon: IoListOutline, capability: "manageMasterData" },
      { href: "/lab/activity", key: "activity", icon: IoTimeOutline, capability: "viewActivity" },
      { href: "/users", key: "users", icon: IoPeopleOutline, capability: "manageUsers" },
    ],
  },
  {
    module: "eksplorasi",
    items: [
      { href: "/eksplorasi/drilling", key: "drilling", icon: IoCompassOutline, capability: "manageDrilling" },
    ],
  },
  {
    module: "system",
    items: [
      { href: "/users", key: "adminAccounts", icon: IoPeopleOutline, capability: "manageUsers" },
      { href: "/admin", key: "admin", icon: IoSettingsOutline, capability: "manageAnnouncements" },
      { href: "/admin/sign-ins", key: "signInAudit", icon: IoFingerPrintOutline, capability: "viewSignInAudit" },
    ],
  },
] as const satisfies readonly {
  module: ModuleKey;
  items: readonly { href: string; key: string; icon: unknown; capability: Capability }[];
}[];

/** Matches the section, not any path that merely starts with the same letters. */
function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

/** Brand + navigation only. The account controls live in the header. */
export function SidebarNav({
  user,
  onNavigate,
}: {
  user: SessionPayload;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const groups = NAV_GROUPS.filter((group) => canAccessModule(user, group.module))
    .map((group) => ({ ...group, items: group.items.filter((item) => can(user, item.capability)) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <div className="px-3 py-4">
        <Brand onNavigate={onNavigate} />
      </div>

      {/* Scrolls on its own if the menu ever outgrows the viewport. */}
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" data-tour="sidebar-nav">
        <NavList
          items={[{ href: HOME_PATH, key: "home", icon: IoHomeOutline }]}
          pathname={pathname}
          onNavigate={onNavigate}
        />
        {groups.map((group) => (
          <div key={group.module}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t(`groups.${group.module}`)}
            </p>
            <NavList items={group.items} pathname={pathname} onNavigate={onNavigate} />
          </div>
        ))}
        <NavList
          items={[{ href: "/help", key: "help", icon: IoHelpCircleOutline }]}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </nav>
    </>
  );
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: readonly { href: string; key: string; icon: IconType }[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  // The most specific match only: /admin/sign-ins is not also /admin.
  const active = items
    .filter((item) => isActivePath(pathname, item.href))
    .reduce<string | null>((best, item) => (best && best.length >= item.href.length ? best : item.href), null);

  return (
    <ul className="flex flex-col gap-1">
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
                // min-h-11 clears a 44px touch target, the size iOS asks
                // for and the size a gloved thumb needs.
                "relative flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "surface-hero text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{t(item.key)}</span>
              {/* Inside the Link, which is how useLinkStatus scopes
                  itself to this navigation rather than to any. */}
              <NavPending />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
