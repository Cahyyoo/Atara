import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { QcDashboard } from "@/modules/eksplorasi/components/dashboard/qc-dashboard";
import { loadQcCharts } from "@/modules/eksplorasi/lib/qc-service";

export const dynamic = "force-dynamic";

/** The eksplorasi dashboard: the QC scatter plots of the standards and the duplicates. */
export default async function ExplorationDashboardPage() {
  await requireCapabilityPage("manageExplorationData");
  // Ni over every assay is what the page opens on, so it comes with the page
  // rather than being fetched again from the browser after hydration.
  const [initial, t] = await Promise.all([loadQcCharts({ element: "ni" }), getTranslations("qcDashboard")]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <QcDashboard initial={initial} />
    </div>
  );
}
