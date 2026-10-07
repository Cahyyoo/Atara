import { redirect } from "next/navigation";
import { getActiveSession, mustChangePassword, signInPath } from "@/lib/page-auth";
import { AppShell } from "@/components/layout/app-shell";
import { prisma } from "@/lib/prisma";
import { loadActiveAnnouncements } from "@/lib/announcements";

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
  const [announcements, account] = await Promise.all([
    loadActiveAnnouncements(session.role),
    prisma.user.findUnique({ where: { id: session.userId }, select: { guideSeenAt: true } }),
  ]);

  return (
    <AppShell
      user={session}
      announcements={announcements}
      showWelcome={account !== null && account.guideSeenAt === null}
    >
      {children}
    </AppShell>
  );
}
