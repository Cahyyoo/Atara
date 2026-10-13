"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AppModule } from "@/core/lib/app/module-types";
import type { SessionPayload } from "@/core/lib/auth/auth";
import { HOME_PATH, activeNavItem, moduleEntryPath, navFor } from "@/core/lib/app/modules";
import { IoChevronForward, IoHomeOutline } from "react-icons/io5";

/**
 * Where this page sits -- every app › the module › the page -- in the header,
 * the way an SAP Fiori shell bar takes the open app's title. A page with no
 * menu entry of its own (a sample's page) ends at the module.
 */
export function Breadcrumb({
  module: appModule,
  user,
  pathname,
}: {
  module: AppModule;
  user: SessionPayload;
  pathname: string;
}) {
  const t = useTranslations("nav");
  const page = activeNavItem(pathname, navFor(user, appModule));
  const moduleName = t(`groups.${appModule.key}`);
  const separator = <IoChevronForward aria-hidden className="size-3 shrink-0 text-muted-foreground/70" />;
  const linkClass = "truncate rounded-md px-1 py-0.5 transition-colors hover:text-foreground";

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <li className="flex shrink-0">
          <Link href={HOME_PATH} aria-label={t("allApps")} title={t("allApps")} className={linkClass}>
            <IoHomeOutline aria-hidden className="size-4" />
          </Link>
        </li>
        <li className="flex min-w-0 items-center gap-1.5">
          {separator}
          <Link href={moduleEntryPath(user, appModule)} className={linkClass}>
            {moduleName}
          </Link>
        </li>
        {page ? (
          <li className="flex min-w-0 items-center gap-1.5">
            {separator}
            <span aria-current="page" className="truncate px-1 font-medium text-foreground">
              {t(page.key)}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
