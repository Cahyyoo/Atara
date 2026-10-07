"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { IoLanguageOutline } from "react-icons/io5";

/**
 * Language choice before signing in.
 *
 * The switcher in the account menu is only reachable once you are already in,
 * so without this an English reader facing the Indonesian default has no way
 * out of it.
 */
export function LoginLocaleSwitch() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(value: string) {
    if (value === locale) return;
    // The locale lives in a cookie the server reads, so the tree has to be
    // refetched for the change to show.
    startTransition(async () => {
      await setLocale(value);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <IoLanguageOutline aria-hidden className="size-3.5" />
      <span className="sr-only">{t("language")}</span>
      {LOCALES.map((value, index) => (
        <span key={value} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden>·</span> : null}
          <button
            type="button"
            disabled={isPending}
            aria-current={value === locale ? "true" : undefined}
            onClick={() => choose(value)}
            className={cn(
              "rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
              value === locale && "font-medium text-foreground"
            )}
          >
            {LOCALE_LABELS[value]}
          </button>
        </span>
      ))}
    </div>
  );
}
