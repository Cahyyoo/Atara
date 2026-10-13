import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/core/i18n/config";
import { messagesFor } from "@/core/i18n/catalogue";
import { getActiveSession, mustChangePassword, signInPath } from "@/core/lib/http/page-auth";

/**
 * The wall-monitor view, outside the app shell: no sidebar, no header, and
 * no tab lock, so a TV left open in one tab does not fight the tab somebody
 * is working in. The (app) layout is what normally checks the session, so
 * this one has to as well.
 */
export default async function TvLayout({ children }: { children: ReactNode }) {
  const session = await getActiveSession();
  if (!session) {
    redirect(await signInPath());
  }
  if (await mustChangePassword()) {
    redirect("/change-password");
  }
  const locale = await getLocale();
  return (
    <NextIntlClientProvider messages={messagesFor(isLocale(locale) ? locale : DEFAULT_LOCALE, ["lab"])}>
      {children}
    </NextIntlClientProvider>
  );
}
