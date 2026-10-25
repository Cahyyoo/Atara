import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { CrmListPage } from "@/modules/eksplorasi/components/crm/crm-list-page";

export const dynamic = "force-dynamic";

/** The CRM List: the standards, blank and duplicate reference values, one table each. */
export default async function CrmListRoute() {
  await requireCapabilityPage("manageExplorationData");
  const t = await getTranslations("crmList");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <CrmListPage />
    </div>
  );
}
