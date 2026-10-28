import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { QcControlSection } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { loadStandardControl } from "@/modules/eksplorasi/lib/qc-control-service";

export const dynamic = "force-dynamic";

/** The eksplorasi dashboard: the control charts of one OREAS standard. */
export default async function ExplorationDashboardPage() {
  await requireCapabilityPage("manageExplorationData");
  // The first standard with assays is what the page opens on, so it comes
  // with the page rather than being fetched again from the browser after
  // hydration.
  const [initialControl, t] = await Promise.all([loadStandardControl({}), getTranslations("qcDashboard")]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <QcControlSection initial={initialControl} />
    </div>
  );
}
