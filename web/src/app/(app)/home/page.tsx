import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/core/components/ui/badge";
import { requireSessionPage } from "@/core/lib/http/page-auth";
import { modulesFor } from "@/core/lib/app/modules";
import { DEPARTMENT_LABEL_KEYS, personaLabelKeys } from "@/core/lib/auth/role-labels";
import { IoArrowForward } from "react-icons/io5";

export const dynamic = "force-dynamic";

/**
 * The portal: where everybody lands after signing in, with a card for each
 * module they may open (modules.ts). One card for nearly everybody today --
 * a person works in one department -- but the door is the same for all, and
 * it is where the next modules will appear.
 */
export default async function HomePage() {
  const session = await requireSessionPage();
  const [t, tRoles] = await Promise.all([getTranslations("home"), getTranslations("users.dialog")]);
  const modules = modulesFor(session);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("greeting", { name: session.name })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <div className="flex flex-wrap gap-2">
          <Badge>{tRoles(personaLabelKeys(session).name)}</Badge>
          {session.department ? (
            <Badge variant="secondary">{tRoles(DEPARTMENT_LABEL_KEYS[session.department])}</Badge>
          ) : null}
        </div>
      </div>

      {modules.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">{t("noModules")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ key, homePath, icon: Icon }) => (
            <li key={key}>
              <Link
                href={homePath}
                className="group flex h-full flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <span className="surface-hero flex size-11 items-center justify-center rounded-xl text-white">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="flex flex-1 flex-col gap-1">
                  <span className="text-base font-semibold group-hover:text-primary">
                    {t(`modules.${key}.name`)}
                  </span>
                  <span className="text-sm text-muted-foreground">{t(`modules.${key}.description`)}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t("open")}
                  <IoArrowForward aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
