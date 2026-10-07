import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { MyScansCard } from "@/components/dashboard/my-scans-card";
import { SamplesTable } from "@/components/samples/samples-table";
import { getActiveSession } from "@/lib/page-auth";
import { cachedAnalytics } from "@/lib/analytics-cache";
import { resolveAnalyticsRange } from "@/lib/analytics-range";
import { can } from "@/lib/permissions";
import { dashboardLayoutFor } from "@/lib/dashboard-layout";
import { loadShiftScanSummary } from "@/lib/my-scans";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getActiveSession();
  if (!session) {
    redirect("/login");
  }

  // Every role lands here; each sees the part of the overview its work asks
  // about (dashboard-layout.ts). Exporting the samples table stays with
  // manageDashboard, the same capability its route checks.
  const layout = dashboardLayoutFor(session.role);
  const canExport = can(session.role, "manageDashboard");

  // The default window is what practically every visit asks for, so it is
  // computed here rather than fetched again from the browser after hydration.
  const defaultRange = resolveAnalyticsRange();
  // Both cached: every session lands here after signing in, and at shift
  // change that is a thousand renders in ten minutes of the same window.
  const [analytics, t, myScans] = await Promise.all([
    cachedAnalytics(defaultRange.from, defaultRange.to),
    getTranslations("dashboard"),
    layout.myScans ? loadShiftScanSummary(session.userId) : null,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <DashboardOverview
        layout={layout}
        initialAnalytics={analytics}
        canDownloadReport={can(session.role, "exportDatabase")}
        myScans={myScans ? <MyScansCard summary={myScans} /> : undefined}
      >
        {layout.allSamples ? (
          <Suspense fallback={null}>
            <SamplesTable canExport={canExport} />
          </Suspense>
        ) : null}
      </DashboardOverview>
    </div>
  );
}
