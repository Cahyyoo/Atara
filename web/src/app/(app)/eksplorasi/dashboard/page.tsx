import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { QcDashboard } from "@/modules/eksplorasi/components/dashboard/qc-dashboard";
import { loadStandardControl } from "@/modules/eksplorasi/lib/qc-control-service";
import { loadBlankCharts } from "@/modules/eksplorasi/lib/qc-blank-service";
import { loadDuplicateCharts } from "@/modules/eksplorasi/lib/qc-duplicate-service";

export const dynamic = "force-dynamic";

/** The eksplorasi dashboard: the control charts of one OREAS standard, the blank charts, and the duplicate charts. */
export default async function ExplorationDashboardPage() {
  await requireCapabilityPage("manageExplorationData");
  // The first standard with assays, every campaign's blanks, and every
  // duplicate pair are what the page opens on, so they come with the page
  // rather than being fetched again from the browser after hydration.
  const [initialControl, initialBlank, duplicates, t] = await Promise.all([
    loadStandardControl({}),
    loadBlankCharts({}),
    loadDuplicateCharts(),
    getTranslations("qcDashboard"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <QcDashboard initialControl={initialControl} initialBlank={initialBlank} duplicates={duplicates} />
    </div>
  );
}
