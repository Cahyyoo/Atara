import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/lib/page-auth";
import { DrillHolesTable } from "@/components/drilling/drill-holes-table";

export const dynamic = "force-dynamic";

/** The drilling data of the Eksplorasi module. */
export default async function DrillingPage() {
  await requireCapabilityPage("manageDrilling");
  const t = await getTranslations("drilling");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <DrillHolesTable />
    </div>
  );
}
