import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { DataQualityView } from "@/modules/lab/components/data-quality/data-quality";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { can } from "@/core/lib/auth/permissions";

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
