import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { DataQualityView } from "@/components/data-quality/data-quality";
import { requireCapabilityPage } from "@/lib/page-auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const session = await requireCapabilityPage("viewDatabase");
  const t = await getTranslations("dataQuality");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-lg bg-muted/40" />}>
        <DataQualityView canExport={can(session, "exportDatabase")} />
      </Suspense>
    </div>
  );
}
