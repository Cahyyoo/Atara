"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Brand, SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { QuickSearch } from "@/components/layout/quick-search";
import { MotionProvider, PageTransition } from "@/components/layout/motion-provider";
import { SessionWatch } from "@/components/layout/session-watch";
import { SampleOriginTracker } from "@/components/layout/sample-origin-tracker";
import { TabLock } from "@/components/layout/tab-lock";
import { AnnouncementBanner } from "@/components/layout/announcement-banner";
import { WelcomeDialog } from "@/components/layout/welcome-dialog";
import { TourRunner } from "@/components/tour/tour-runner";
import type { SessionPayload } from "@/lib/auth";
import { helpSectionForPath } from "@/lib/help-sections";
import { cn } from "@/lib/utils";
import type { AnnouncementDTO } from "@/types";
import { IoHelpCircleOutline, IoMenuOutline } from "react-icons/io5";

export function AppShell({
  user,
  announcements = [],
  showWelcome = false,
  children,
}: {
  user: SessionPayload;
  /** What the administrator has put above every page for this role now. */
  announcements?: AnnouncementDTO[];
  /** True until this account has seen the welcome guide once. */
  showWelcome?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const helpSection = helpSectionForPath(pathname);

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
            <QuickSearch />
            <UserMenu user={user} />
          </div>
        </header>

        <AnnouncementBanner announcements={announcements} />

        <main className="flex-1 overflow-x-clip">
          <div className="mx-auto max-w-7xl px-4 pb-8 pt-2 sm:px-6">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>

      {/* One tab per browser: the newest tab has the app, the others step aside. */}
      <TabLock />
      {/* One browser per account: says so the moment another one takes over.
          After the tab lock, so its dialog sits on top when both apply. */}
      <SessionWatch />
      {/* Where the sample pages were opened from, for their "Kembali". */}
      <SampleOriginTracker />
      {showWelcome ? <WelcomeDialog role={user.role} name={user.name} /> : null}
      {/* A guided tour, when the address asks for one (?tour=...). */}
      <Suspense fallback={null}>
        <TourRunner role={user.role} />
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
