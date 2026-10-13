import { getFormatter, getTranslations } from "next-intl/server";
import { ModuleCard } from "@/core/components/launcher/module-card";
import { QuickAccess } from "@/core/components/launcher/quick-access";
import { requireSessionPage } from "@/core/lib/http/page-auth";
import { HOME_PATH, moduleEntryPath, modulesFor, navFor } from "@/core/lib/app/modules";
import { tourFor, tourHref } from "@/core/lib/app/tours";
import { DEPARTMENT_LABEL_KEYS, personaLabelKeys } from "@/core/lib/auth/role-labels";
import { IoGridOutline } from "react-icons/io5";

export const dynamic = "force-dynamic";

/**
 * The launcher: where everybody lands after signing in, as in Odoo -- no
 * sidebar, a card for each module they may open (modules.ts). Each card links
 * straight to the pages this person will find inside, so the same Settings
 * card offers the lab admin Users and the super admin more. Beside them, the
 * account and a few quick ways in (the guide, a tour, a new password). Inside
 * a module the sidebar's switcher and the header's breadcrumb lead back here.
 */
export default async function HomePage() {
  const session = await requireSessionPage();
  const [t, tNav, tRoles, format] = await Promise.all([
    getTranslations("home"),
    getTranslations("nav"),
    getTranslations("users.dialog"),
    getFormatter(),
  ]);
  const modules = modulesFor(session);
  // The lab's clock, whatever the server's.
  const today = format.dateTime(new Date(), { dateStyle: "full", timeZone: "Asia/Makassar" });
  const accountTour = tourFor("account");

  return (
    // Compact on purpose: on a 1366x768 laptop the browser leaves about 680px,
    // and every card with its shortcuts has to fit in that without a scroll.
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pt-2 sm:pt-4">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("greeting", { name: session.name })}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="launcher-heading" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="launcher-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("yourApps")}
            </h2>
            {modules.length > 0 ? (
              <span className="text-xs text-muted-foreground">{t("appCount", { count: modules.length })}</span>
            ) : null}
          </div>

          {modules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <IoGridOutline aria-hidden className="size-6" />
              </span>
              <p className="font-semibold">{t("noModulesTitle")}</p>
              <p className="max-w-md text-sm text-muted-foreground">{t("noModules")}</p>
            </div>
          ) : (
            <ul data-tour="module-launcher" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {modules.map((appModule, index) => (
                <li key={appModule.key}>
                  <ModuleCard
                    index={index}
                    href={moduleEntryPath(session, appModule)}
                    icon={appModule.icon}
                    name={t(`modules.${appModule.key}.name`)}
                    description={t(`modules.${appModule.key}.description`)}
                    shortcutsLabel={t("shortcuts")}
                    shortcuts={navFor(session, appModule).map((item) => ({
                      href: item.href,
                      label: tNav(item.key),
                      icon: item.icon,
                    }))}
                    moreLabel={(count) => t("more", { count })}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="lg:pt-8">
          <QuickAccess
            name={session.name}
            email={session.email}
            badges={[
              { label: tRoles(personaLabelKeys(session).name), variant: "default" },
              ...(session.department
                ? [{ label: tRoles(DEPARTMENT_LABEL_KEYS[session.department]), variant: "secondary" as const }]
                : []),
            ]}
            tourHref={accountTour ? tourHref(accountTour) : HOME_PATH}
            labels={{
              title: t("quick.title"),
              account: t("quick.account"),
              guide: t("quick.guide"),
              guideHint: t("quick.guideHint"),
              tour: t("quick.tour"),
              tourHint: t("quick.tourHint"),
              password: t("quick.password"),
              passwordHint: t("quick.passwordHint"),
            }}
          />
        </aside>
      </div>
    </div>
  );
}
