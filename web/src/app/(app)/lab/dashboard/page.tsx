import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { DashboardOverview } from "@/modules/lab/components/dashboard/dashboard-overview";
import { MyScansCard } from "@/modules/lab/components/dashboard/my-scans-card";
import { SamplesTable } from "@/modules/lab/components/samples/samples-table";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { cachedAnalytics } from "@/modules/lab/lib/analytics/analytics-cache";
import { resolveAnalyticsRange } from "@/modules/lab/lib/analytics/analytics-range";
import { can, personaOf } from "@/core/lib/auth/permissions";
import { isLabPersona } from "@/modules/lab/capabilities";
import { dashboardLayoutFor } from "@/modules/lab/lib/analytics/dashboard-layout";
import { loadShiftScanSummary } from "@/modules/lab/lib/stages/my-scans";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireCapabilityPage("viewDashboard");
  // Every lab role lands here; each sees the part of the overview its work
  // asks about (dashboard-layout.ts). Exporting the samples table stays with
  // manageDashboard, the same capability its route checks.
  const persona = personaOf(session);
  if (!isLabPersona(persona)) redirect("/home");
  const layout = dashboardLayoutFor(persona);
  const canExport = can(session, "manageDashboard");

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
        canDownloadReport={can(session, "exportDatabase")}
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
