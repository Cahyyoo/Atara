import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { getActiveSession, mustChangePassword, signInPath } from "@/core/lib/http/page-auth";
import { AppShell } from "@/core/components/layout/app-shell";
import { prisma } from "@/core/lib/prisma";
import { loadActiveAnnouncements } from "@/modules/system/lib/announcements";
import { DEFAULT_LOCALE, isLocale } from "@/core/i18n/config";
import { messagesFor, moduleKeysFor } from "@/core/i18n/catalogue";
import { SIDEBAR_COOKIE, isSidebarCollapsed } from "@/core/lib/ui/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getActiveSession();
  if (!session) {
    redirect(await signInPath());
  }
  // A password an administrator chose is replaced before anything else.
  if (await mustChangePassword()) {
    redirect("/change-password");
  }

  // Both small: a cached list of a few banners, and one column by primary key.
  const [announcements, account, locale, cookieStore] = await Promise.all([
    loadActiveAnnouncements(session.role),
    prisma.user.findUnique({ where: { id: session.userId }, select: { guideSeenAt: true } }),
    getLocale(),
    cookies(),
  ]);

  // The words of the modules this person works in, and no others.
  const messages = messagesFor(isLocale(locale) ? locale : DEFAULT_LOCALE, moduleKeysFor(session));

  return (
    <NextIntlClientProvider messages={messages}>
      <AppShell
        user={session}
        announcements={announcements}
        showWelcome={account !== null && account.guideSeenAt === null}
        sidebarCollapsed={isSidebarCollapsed(cookieStore.get(SIDEBAR_COOKIE)?.value)}
      >
        {children}
      </AppShell>
    </NextIntlClientProvider>
  );
}
