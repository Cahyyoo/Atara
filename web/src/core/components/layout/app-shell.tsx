"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/core/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/core/components/ui/dialog";
import { Brand, SidebarNav } from "@/core/components/layout/sidebar-nav";
import { VersionFooter } from "@/core/components/layout/version-footer";
import { UserMenu } from "@/core/components/layout/user-menu";
import { MotionProvider, PageTransition } from "@/core/components/layout/motion-provider";
import { SessionWatch } from "@/core/components/layout/session-watch";
import { TabLock } from "@/core/components/layout/tab-lock";
import { AnnouncementBanner } from "@/core/components/layout/announcement-banner";
import { WelcomeDialog } from "@/core/components/layout/welcome-dialog";
import { TourRunner } from "@/core/components/tour/tour-runner";
import type { SessionPayload } from "@/core/lib/auth/auth";
import { helpSectionForPath } from "@/core/lib/app/help-sections";
import { personaOf } from "@/core/lib/auth/permissions";
import { modulesFor } from "@/core/lib/app/modules";
import { cn } from "@/core/lib/utils";
import type { BannerDTO } from "@/core/types";
import { IoHelpCircleOutline, IoMenuOutline } from "react-icons/io5";

export function AppShell({
  user,
  announcements = [],
  showWelcome = false,
  children,
}: {
  user: SessionPayload;
  /** What the administrator has put above every page for this role now. */
  announcements?: BannerDTO[];
  /** True until this account has seen the welcome guide once. */
  showWelcome?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const helpSection = helpSectionForPath(pathname);
  const persona = personaOf(user);
  // What the person's modules add to the shell: the lab's sample search in
  // the header, its sample-origin tracker out of sight. The shell itself
  // names no module.
  const extras = modulesFor(user).flatMap((m) => (m.shell ? [m.shell] : []));

  return (
    <MotionProvider>
    {/* Cards are separated from the page by depth rather than by lines, which
        is what makes the whole thing read as iOS rather than as a web table. */}
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop: sticky, so the menu stays put while the page scrolls. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-background lg:flex">
        <SidebarNav user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Translucent and blurred, so content passing underneath is felt
            rather than hidden behind a solid bar. */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 bg-canvas/80 px-3 backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("openNavigation")}
              className="lg:hidden"
              onClick={() => setIsNavOpen(true)}
            >
              <IoMenuOutline className="size-5" />
            </Button>
            {/* The sidebar already carries the brand from lg upwards. */}
            <div className="lg:hidden">
              <Brand />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Straight to the part of the guide about the page being looked at. */}
            <Link
              data-tour="help-button"
              href={helpSection ? `/help#${helpSection}` : "/help"}
              aria-label={t("help")}
              title={t("help")}
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-muted-foreground")}
            >
              <IoHelpCircleOutline className="size-5" />
            </Link>
            {extras.map(({ header: Header }, index) => (Header ? <Header key={index} /> : null))}
            <UserMenu user={user} />
          </div>
        </header>

        <AnnouncementBanner announcements={announcements} />

        <main className="flex-1 overflow-x-clip">
          <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6">
            <PageTransition>{children}</PageTransition>
            {/* Outside the transition, so it does not animate on every move. */}
            <VersionFooter />
          </div>
        </main>
      </div>

      {/* One tab per browser: the newest tab has the app, the others step aside. */}
      <TabLock />
      {/* One browser per account: says so the moment another one takes over.
          After the tab lock, so its dialog sits on top when both apply. */}
      <SessionWatch />
      {/* Where the sample pages were opened from, for their "Kembali". */}
      {extras.map(({ background: Background }, index) => (Background ? <Background key={index} /> : null))}
      {showWelcome && persona ? <WelcomeDialog persona={persona} name={user.name} /> : null}
      {/* A guided tour, when the address asks for one (?tour=...). */}
      <Suspense fallback={null}>
        <TourRunner access={user} />
      </Suspense>

      <Dialog open={isNavOpen} onOpenChange={setIsNavOpen}>
        <DialogContent
          showCloseButton={false}
          className="left-0 top-0 flex h-full w-72 max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{t("menu")}</DialogTitle>
          <SidebarNav user={user} onNavigate={() => setIsNavOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
    </MotionProvider>
  );
}
