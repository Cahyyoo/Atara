import { getTranslations } from "next-intl/server";
import { requireCapabilityPage } from "@/lib/page-auth";
import { MasterDataTables } from "@/components/master/master-data-tables";

export const dynamic = "force-dynamic";

export default async function MasterDataPage() {
  await requireCapabilityPage("manageMasterData");
  const t = await getTranslations("masterData");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <MasterDataTables />
    </div>
  );
}
