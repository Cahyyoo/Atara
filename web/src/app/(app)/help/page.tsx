import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpToc } from "@/components/help/help-toc";
import { TryTourButton } from "@/components/help/try-tour-button";
import { tourFor } from "@/lib/tours";
import { requireSessionPage } from "@/lib/page-auth";
import { helpSectionsFor } from "@/lib/help-sections";
import { personaLabelKeys } from "@/lib/role-labels";
import { cn } from "@/lib/utils";
import { IoArrowForward, IoBulbOutline } from "react-icons/io5";

export const dynamic = "force-dynamic";

/**
 * The guide: one section per page this person can open, in menu order. Cards at
 * the top for jumping straight in, contents beside it on wide screens, and
 * each section's steps laid out as a short timeline. The section the "?"
 * button pointed at is outlined, through the CSS :target state alone.
 */
export default async function HelpPage() {
  // Everybody has a guide; what is in it depends on who they are.
  const session = await requireSessionPage();
  const [t, tRoles] = await Promise.all([getTranslations("help"), getTranslations("users.dialog")]);
  const sections = helpSectionsFor(session).map((section) => ({
    ...section,
    title: t(`sections.${section.key}.title`),
    intro: t(`sections.${section.key}.intro`),
    // Numbered keys ("1", "2", ...) rather than an array: the message
    // catalogues hold strings only. Integer-like keys keep their order.
    steps: Object.values(t.raw(`sections.${section.key}.steps`) as Record<string, string>),
    tip: t.has(`sections.${section.key}.tip`) ? t(`sections.${section.key}.tip`) : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{t("forRole", { role: tRoles(personaLabelKeys(session).name) })}</Badge>
          <span className="text-xs text-muted-foreground">
            {t("sectionCount", { count: sections.length })}
          </span>
        </div>
      </div>

      {/* Straight to a section: the contents for a phone, a shortcut on a desk. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map(({ key, icon: Icon, title, intro }) => (
          <li key={key}>
            <a
              href={`#${key}`}
              className="group flex h-full gap-3 rounded-2xl border bg-card p-3.5 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon aria-hidden className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium group-hover:text-primary">{title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{intro}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr]">
        <HelpToc label={t("contents")} sections={sections.map(({ key, title }) => ({ key, title }))} />

        <div className="flex flex-col gap-4">
          {sections.map(({ key, icon: Icon, title, intro, steps, tip, ...section }) => (
            <Card
              key={key}
              id={key}
              className="scroll-mt-20 transition-shadow target:ring-2 target:ring-primary/40"
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground">{intro}</p>
                </div>
                <div className="hidden shrink-0 gap-2 sm:flex">
                  {/* Try it: the page opens with its tour running. */}
                  {tourFor(key) ? <TryTourButton tourKey={key} className="gap-1" /> : null}
                  {"href" in section ? (
                    <Link
                      href={section.href}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
                    >
                      {t("openPage")}
                      <IoArrowForward aria-hidden className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* A short timeline: numbered dots joined by a line. Still a
                    list underneath, so it reads as one to a screen reader. */}
                <ol className="flex flex-col">
                  {steps.map((step, index) => (
                    <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
                      {index < steps.length - 1 ? (
                        <span aria-hidden className="absolute left-3 top-7 bottom-1 w-px -translate-x-1/2 bg-border" />
                      ) : null}
                      <span
                        aria-hidden
                        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                      >
                        {index + 1}
                      </span>
                      <p className="pt-0.5 text-sm">{step}</p>
                    </li>
                  ))}
                </ol>

                {tip ? (
                  <div className="flex gap-2.5 rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-900 dark:text-amber-200">
                    <IoBulbOutline aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <p>
                      <span className="font-medium">{t("tip")}: </span>
                      {tip}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 sm:hidden">
                  {tourFor(key) ? <TryTourButton tourKey={key} className="gap-1" /> : null}
                  {"href" in section ? (
                    <Link
                      href={section.href}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}
                    >
                      {t("openPage")}
                      <IoArrowForward aria-hidden className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
